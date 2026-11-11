/**
 * 调度原语（nomo: viewport_ui 的两个定时器 + host 的确认队列的 Web 版）。
 *
 * - `coalesceRaf`：滚动/输入热路径合并到下一帧（nomo 的 pane_tick）。
 * - `debounceTrailing`：静默期 + 最长陈旧期双阈值（nomo 的
 *   `min(300ms, 900ms - dirty_since)`）。
 * - `sliceWork`：把一串任务按 4 ms 预算切片，用 requestIdleCallback 驱动
 *   （nomo 的 batchMs = 4）。
 * - `RevGuard`：异步结果回来后核对修订号，过期直接丢弃。
 */
export function coalesceRaf(fn: () => void): () => void {
  let handle = 0;
  let cancelled = false;
  const run = () => {
    handle = 0;
    if (!cancelled) fn();
  };
  const schedule = () => {
    if (handle || cancelled) return;
    handle = window.requestAnimationFrame(run);
  };
  schedule();
  return () => {
    cancelled = true;
    if (handle) window.cancelAnimationFrame(handle);
  };
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  flush(): void;
  cancel(): void;
}

/**
 * 双阈值防抖：最后一次调用后 quietMs 执行；若一直有调用，最迟 maxMs 后
 * 必须执行一次（避免长文输入时大纲/统计永远不更新）。
 */
export function debounceTrailing<A extends unknown[]>(
  fn: (...args: A) => void,
  quietMs = 300,
  maxMs = 900,
): Debounced<A> {
  let timer = 0;
  let firstDirtyAt = 0;
  let lastArgs: A | null = null;

  const invoke = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    firstDirtyAt = 0;
    const args = lastArgs;
    lastArgs = null;
    if (args) fn(...args);
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (!firstDirtyAt) firstDirtyAt = performance.now();
    if (timer) window.clearTimeout(timer);
    const stale = performance.now() - firstDirtyAt;
    const wait = Math.max(0, Math.min(quietMs, maxMs - stale));
    timer = window.setTimeout(invoke, wait);
  }) as Debounced<A>;

  debounced.flush = invoke;
  debounced.cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    firstDirtyAt = 0;
    lastArgs = null;
  };
  return debounced;
}

interface IdleWindow {
  requestIdleCallback?: (cb: (deadline: { timeRemaining(): number }) => void, opts?: { timeout: number }) => number;
}

/** 4 ms 预算的分片执行器：一次空闲窗口里只跑够预算的任务 */
export function sliceWork<T>(items: T[], each: (item: T) => void, budgetMs = 4): void {
  let index = 0;
  const idle = (window as unknown as IdleWindow).requestIdleCallback;
  const step = (deadline?: { timeRemaining(): number }) => {
    const started = performance.now();
    while (index < items.length) {
      each(items[index]);
      index += 1;
      if (performance.now() - started > budgetMs) break;
      if (deadline && deadline.timeRemaining() < 1) break;
    }
    if (index < items.length) {
      if (idle) idle(step, { timeout: 120 });
      else window.setTimeout(() => step(), 16);
    }
  };
  if (idle) idle(step, { timeout: 120 });
  else window.setTimeout(() => step(), 0);
}

/** 修订守卫：异步回调返回时核对文档修订，过期结果丢弃（nomo 的 revision guard） */
export class RevGuard {
  private current = 0;

  bump(): number {
    this.current += 1;
    return this.current;
  }

  get token(): number {
    return this.current;
  }

  valid(token: number): boolean {
    return token === this.current;
  }
}

/** 单槽异步任务：新请求覆盖旧请求，旧请求的回调被忽略 */
export class SingleFlight {
  private token = 0;

  run<T>(fn: () => Promise<T>, apply: (value: T) => void, drop?: () => void): void {
    const token = ++this.token;
    fn().then(
      (value) => {
        if (token === this.token) apply(value);
        else drop?.();
      },
      () => {
        if (token === this.token) drop?.();
      },
    );
  }

  cancel(): void {
    this.token += 1;
  }
}