/**
 * 有界缓存（对齐 nomo `cache.rs` / `code_highlight.rs` 的双上限策略）：
 * 条目数 + 估算字节同时受限，淘汰时线性找最久未用项，且至少保留 1 项。
 */
export class LruCache<V> {
  private map = new Map<string, { value: V; bytes: number; clock: number }>();
  private clock = 0;

  constructor(
    private maxEntries: number,
    private maxBytes: number,
    /** 估算单条字节数；默认按 2 倍字符长度 */
    private weigh: (key: string, value: V) => number = () => 256,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    hit.clock = ++this.clock;
    return hit.value;
  }

  set(key: string, value: V): void {
    const bytes = this.weigh(key, value);
    this.map.set(key, { value, bytes, clock: ++this.clock });
    this.trim();
  }

  /** 键存在则复用（不刷新时钟），用于"按内容哈希查找"的命中路径 */
  peek(key: string): V | undefined {
    return this.map.get(key)?.value;
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  private trim(): void {
    if (this.map.size <= this.maxEntries && this.totalBytes() <= this.maxBytes) return;
    let bytes = this.totalBytes();
    while (
      this.map.size > 1 &&
      (this.map.size > this.maxEntries || bytes > this.maxBytes)
    ) {
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, v] of this.map) {
        if (v.clock < oldest) {
          oldest = v.clock;
          oldestKey = k;
        }
      }
      if (oldestKey === null) break;
      bytes -= this.map.get(oldestKey)!.bytes;
      this.map.delete(oldestKey);
    }
  }

  private totalBytes(): number {
    let sum = 0;
    for (const v of this.map.values()) sum += v.bytes;
    return sum;
  }
}

/** 基于字符串内容的稳定短哈希（FNV-1a 32 位；缓存键用，不做安全用途）。 */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ":" + input.length.toString(36);
}
