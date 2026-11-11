/**
 * 编辑器视口（nomo: viewport_ui + view 的 Web 版）。
 *
 * 窗口化：只挂载「可视区 + 前后预取」的块，其余用上下两个占位高度顶开；
 * 高度先按 kind 估算，再被实测替换，实测差异会补偿 scrollTop（滚动锚点）。
 * 输入热路径：打字只更新 session 里那一个块，不触发整篇重渲染（块级 memo +
 * 只映射窗口内的块），派生数据（大纲/统计/保存）走 300/900 ms 双阈值防抖。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { estimateHeight, newBlockId, parseBlock, splitDocument } from "../../core/md/blocks";
import type { Block } from "../../core/md/types";
import { coalesceRaf } from "../../core/perf/scheduler";
import type { DocSession, Sel } from "../../core/doc/session";
import {
  convertBlock,
  indentBlock,
  mergeBackward,
  replaceInBlock,
  setCodeLanguage,
  splitBlock,
  toggleInline,
  toggleTaskAt,
  type TargetKind,
} from "../../core/doc/ops";
import { BlockView, type ActiveState, type BlockHandlers } from "./BlockView";
import { caretIn } from "./caret";
import { copyText } from "./Blocks";
import { t } from "../../lib/i18n";

export type EditorMode = "wysiwyg" | "split" | "source";

export interface EditorApi {
  focusBlock(index: number, offset?: number): void;
  scrollToBlock(index: number): void;
  getSession(): DocSession;
  setMode(mode: EditorMode): void;
}

interface Props {
  session: DocSession;
  theme: string;
  mode: EditorMode;
  readOnly: boolean;
  onDirty(): void;
  onHeadingChange?(blockIndex: number): void;
  registerApi?(api: EditorApi | null): void;
  /** 供外部（工具栏）调用的命令钩子 */
  commandRef?: React.MutableRefObject<((name: string) => void) | null>;
  widthPercent: number;
  zoom: number;
}

const OVERSCAN_BACK = 0.75;
const OVERSCAN_FWD = 1.5;

export default function Editor({
  session,
  theme,
  mode,
  readOnly,
  onDirty,
  onHeadingChange,
  registerApi,
  commandRef,
  widthPercent,
  zoom,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<number[]>([]);
  const measuredRef = useRef<Map<string, number>>(new Map());
  const composingRef = useRef(false);
  const tokenRef = useRef(1);
  const activeIndexRef = useRef(-1);
  const [version, setVersion] = useState(0);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [active, setActive] = useState<ActiveState | null>(null);
  const [slash, setSlash] = useState<{ index: number; left: number; top: number } | null>(null);
  const [contentWidth, setContentWidth] = useState(720);
  const bumpRaf = useRef<(() => void) | null>(null);

  activeIndexRef.current = active ? active.index : -1;

  const bump = useCallback(() => {
    if (bumpRaf.current) return;
    bumpRaf.current = coalesceRaf(() => {
      bumpRaf.current = null;
      setVersion((v) => v + 1);
    });
  }, []);

  /* 内容宽度：随窗口与缩放变化，宽度变化会让估算高度失效 */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const width = Math.max(280, Math.round((el.clientWidth * widthPercent) / 100));
      setContentWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [widthPercent]);

  /* 块变化 → 高度表对齐（保留未变块的实测值） */
  useLayoutEffect(() => {
    const blocks = session.blocks;
    const next: number[] = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) {
      const measured = measuredRef.current.get(blocks[i].id);
      next[i] = measured ?? heightsRef.current[i] ?? estimateHeight(parseBlock(blocks[i].raw), contentWidth);
    }
    heightsRef.current = next;
    const alive = new Set(blocks.map((b) => b.id));
    for (const id of measuredRef.current.keys()) {
      if (!alive.has(id)) measuredRef.current.delete(id);
    }
  }, [session, session.rev, contentWidth]);

  const prefix = useMemo(() => {
    const blocks = session.blocks;
    const out: number[] = new Array(blocks.length + 1);
    out[0] = 0;
    for (let i = 0; i < blocks.length; i++) {
      const measured = measuredRef.current.get(blocks[i].id);
      const height =
        measured ?? heightsRef.current[i] ?? estimateHeight(parseBlock(blocks[i].raw), contentWidth);
      out[i + 1] = out[i] + Math.max(1, height);
    }
    return out;
    // version 参与：实测高度变化后重算前缀和
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, session.rev, contentWidth, version]);

  const total = prefix[prefix.length - 1] ?? 0;

  const recomputeRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    // clientHeight 在极端布局时机可能为 0：退化为视口高度，避免把整篇都挂上去
    const height = el.clientHeight || window.innerHeight;
    const blocks = session.blocks;
    let start = lowerBound(prefix, Math.max(0, top - height * OVERSCAN_BACK));
    let end = lowerBound(prefix, top + height * (1 + OVERSCAN_FWD));
    start = Math.max(0, Math.min(start, blocks.length - 1));
    end = Math.max(start + 1, Math.min(blocks.length, end + 1));
    // 硬上限：单个窗口最多 300 块（实测高度异常时的兜底）
    if (end - start > 300) end = start + 300;
    const activeIndex = activeIndexRef.current;
    if (activeIndex >= 0 && activeIndex < blocks.length) {
      if (activeIndex < start) start = activeIndex;
      if (activeIndex >= end) end = activeIndex + 1;
    }
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [prefix, session]);

  useEffect(() => {
    recomputeRange();
  }, [recomputeRange, version, mode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(() => {
        pending = false;
        recomputeRange();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [recomputeRange]);

  /* ---------- 高度上报（ResizeObserver 批处理 + 滚动锚点补偿） ---------- */
  const measure = useCallback(
    (index: number, height: number) => {
      const block = session.blocks[index];
      if (!block || height <= 0) return;
      const previous = measuredRef.current.get(block.id);
      if (previous !== undefined && Math.abs(previous - height) < 0.6) return;
      measuredRef.current.set(block.id, height);
      const scroller = scrollRef.current;
      if (scroller && previous !== undefined && index < range.start) {
        const delta = height - previous;
        scroller.scrollTop += delta;
      }
      bump();
    },
    [session, range.start, bump],
  );

  /* ---------- 选区聚焦 ---------- */
  const focusSel = useCallback(
    (target: Sel | null) => {
      if (!target) return;
      const index = session.indexOf(target.blockId);
      if (index < 0) return;
      tokenRef.current += 1;
      setActive({ index, sel: { start: target.start, end: target.end }, token: tokenRef.current });
      setSlash(null);
    },
    [session],
  );

  const activate = useCallback(
    (index: number, offset: number, editable: boolean) => {
      if (!editable || readOnly) return;
      tokenRef.current += 1;
      setActive({ index, sel: { start: offset, end: offset }, token: tokenRef.current });
      onHeadingChange?.(index);
    },
    [readOnly, onHeadingChange],
  );

  const handlers: BlockHandlers = useMemo(
    () => ({
      activate,
      toggleTask: (index: number) => {
        toggleTaskAt(session, index);
        onDirty();
      },
      setLang: (index: number, lang: string) => {
        setCodeLanguage(session, index, lang);
        onDirty();
      },
      copy: (text: string) => copyText(text),
      dirty: onDirty,
      keyDown: () => undefined,
      paste: () => undefined,
      blur: () => undefined,
      composing: (value: boolean) => {
        composingRef.current = value;
      },
      measure,
    }),
    [activate, session, onDirty, measure],
  );

  /* ---------- 键盘 ---------- */
  const applySel = useCallback(
    (target: Sel | null) => {
      onDirty();
      focusSel(target);
    },
    [focusSel, onDirty],
  );

  const keyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, index: number) => {
      if (composingRef.current) return;
      const el = event.currentTarget;
      const caret = caretIn(el);
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key;

      if (mod && (key === "z" || key === "Z")) {
        event.preventDefault();
        focusSel(event.shiftKey ? session.redo() : session.undo());
        onDirty();
        return;
      }
      if (mod && key.toLowerCase() === "y") {
        event.preventDefault();
        focusSel(session.redo());
        onDirty();
        return;
      }
      if (mod && (key === "b" || key === "B")) {
        event.preventDefault();
        focusSel(toggleInline(session, index, caret.start, caret.end, "**"));
        onDirty();
        return;
      }
      if (mod && (key === "i" || key === "I")) {
        event.preventDefault();
        focusSel(toggleInline(session, index, caret.start, caret.end, "*"));
        onDirty();
        return;
      }
      if (mod && (key === "e" || key === "E")) {
        event.preventDefault();
        focusSel(toggleInline(session, index, caret.start, caret.end, "`"));
        onDirty();
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        if (event.shiftKey || mod) {
          applySel(replaceInBlock(session, index, caret.start, caret.end, "\n"));
          return;
        }
        applySel(splitBlock(session, index, caret.end));
        return;
      }

      if (key === "Backspace" && caret.start === 0 && caret.end === 0) {
        event.preventDefault();
        applySel(mergeBackward(session, index));
        return;
      }

      if (key === "Tab") {
        event.preventDefault();
        applySel(indentBlock(session, index, event.shiftKey ? -2 : 2));
        return;
      }

      if (key === "ArrowUp" && caret.start === 0 && !event.shiftKey) {
        const prev = index - 1;
        if (prev >= 0) {
          event.preventDefault();
          focusSel({ blockId: session.blocks[prev].id, start: session.blocks[prev].raw.length, end: session.blocks[prev].raw.length });
        }
        return;
      }

      if (key === "ArrowDown" && !event.shiftKey && caret.start === (session.blocks[index]?.raw.length ?? 0)) {
        const next = index + 1;
        if (next < session.blocks.length) {
          event.preventDefault();
          focusSel({ blockId: session.blocks[next].id, start: 0, end: 0 });
        }
        return;
      }

      if (key === "Escape") {
        setSlash(null);
        (el as HTMLElement).blur();
        setActive(null);
      }
    },
    [applySel, focusSel, session, onDirty],
  );

  const slashRef = useRef<{ index: number; caret: number } | null>(null);

  const openSlash = useCallback(
    (index: number) => {
      const el = pageRef.current?.querySelector<HTMLElement>('[data-index="' + index + '"]');
      const scroller = scrollRef.current;
      if (!el || !scroller) return;
      const rect = el.getBoundingClientRect();
      const host = scroller.getBoundingClientRect();
      slashRef.current = { index, caret: 0 };
      // 菜单绝对定位在滚动容器内，因此坐标要含滚动偏移
      setSlash({
        index,
        left: rect.left - host.left + scroller.scrollLeft,
        top: rect.bottom - host.top + scroller.scrollTop + 4,
      });
    },
    [],
  );

  const applySlash = useCallback(
    (target: TargetKind) => {
      const pending = slashRef.current;
      setSlash(null);
      slashRef.current = null;
      if (!pending) return;
      const block = session.blocks[pending.index];
      if (!block) return;
      const raw = block.raw.trim() === "/" ? "" : block.raw;
      if (raw !== block.raw) session.setRaw(pending.index, raw);
      applySel(convertBlock(session, pending.index, target));
    },
    [session, applySel],
  );


  const keyDownWithSlash = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, index: number) => {
      if (slash) {
        if (event.key === "Escape") {
          event.preventDefault();
          setSlash(null);
          slashRef.current = null;
          return;
        }
        return;
      }
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && event.currentTarget.textContent === "") {
        window.setTimeout(() => openSlash(index), 0);
      }
      keyDown(event, index);
    },
    [slash, keyDown, openSlash],
  );

  /* ---------- 粘贴 ---------- */
  const paste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>, index: number) => {
      const text = event.clipboardData.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      const el = event.currentTarget;
      const caret = caretIn(el);
      const block = session.blocks[index];
      if (!block) return;
      const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const head = block.raw.slice(0, caret.start);
      const tail = block.raw.slice(caret.end);

      if (!normalized.includes("\n")) {
        applySel(replaceInBlock(session, index, caret.start, caret.end, normalized));
        return;
      }

      const split = splitDocument(normalized);
      const parts = split.blocks.length ? split.blocks : [{ id: newBlockId(), raw: normalized, sep: "" }];
      const inserted: Block[] = [];
      if (parts.length === 1) {
        inserted.push({ id: block.id, raw: head + parts[0].raw + tail, sep: block.sep });
        session.splice(index, 1, inserted, { coalesceKey: null });
        onDirty();
        focusSel({ blockId: block.id, start: head.length + parts[0].raw.length, end: head.length + parts[0].raw.length });
        return;
      }
      parts.forEach((part, i) => {
        let raw = part.raw;
        if (i === 0) raw = head + raw;
        if (i === parts.length - 1) raw = raw + tail;
        inserted.push({
          id: i === 0 ? block.id : newBlockId(),
          raw,
          sep: i === 0 ? block.sep : part.sep || "\n\n",
        });
      });
      session.splice(index, 1, inserted, { coalesceKey: null });
      onDirty();
      const lastIndex = index + inserted.length - 1;
      focusSel({
        blockId: inserted[inserted.length - 1].id,
        start: inserted[inserted.length - 1].raw.length - tail.length,
        end: inserted[inserted.length - 1].raw.length - tail.length,
      });
      void lastIndex;
    },
    [session, applySel, focusSel, onDirty],
  );

  const blur = useCallback(
    (index: number) => {
      window.setTimeout(() => {
        const focused = document.activeElement;
        if (focused && focused.closest(".blk-editable")) return;
        setActive(null);
        onDirty();
        void index;
      }, 0);
    },
    [onDirty],
  );

  const liveHandlers: BlockHandlers = useMemo(
    () => ({ ...handlers, keyDown: keyDownWithSlash, paste, blur }),
    [handlers, keyDownWithSlash, paste, blur],
  );

  /* ---------- 对外 API ---------- */
  const scrollToBlock = useCallback(
    (index: number) => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const top = prefix[Math.max(0, Math.min(index, prefix.length - 1))];
      scroller.scrollTo({ top: Math.max(0, top - 72), behavior: "smooth" });
    },
    [prefix],
  );

  useEffect(() => {
    if (!registerApi) return;
    const api: EditorApi = {
      focusBlock: (index, offset = 0) => {
        const block = session.blocks[index];
        if (!block) return;
        scrollToBlock(index);
        window.setTimeout(() => {
          tokenRef.current += 1;
          setActive({ index, sel: { start: offset, end: offset }, token: tokenRef.current });
        }, 60);
      },
      scrollToBlock,
      getSession: () => session,
      setMode: () => undefined,
    };
    registerApi(api);
    return () => registerApi(null);
  }, [registerApi, session, scrollToBlock]);

  useEffect(() => {
    if (!commandRef) return;
    commandRef.current = (name: string) => {
      const index = activeIndexRef.current >= 0 ? activeIndexRef.current : 0;
      const sel = active ? active.sel : { start: session.blocks[index]?.raw.length ?? 0, end: 0 };
      const start = Math.min(sel.start, sel.end);
      const end = Math.max(sel.start, sel.end);
      switch (name) {
        case "bold":
          applySel(toggleInline(session, index, start, end, "**"));
          break;
        case "italic":
          applySel(toggleInline(session, index, start, end, "*"));
          break;
        case "code":
          applySel(toggleInline(session, index, start, end, "`"));
          break;
        case "strike":
          applySel(toggleInline(session, index, start, end, "~~"));
          break;
        case "undo":
          focusSel(session.undo());
          onDirty();
          break;
        case "redo":
          focusSel(session.redo());
          onDirty();
          break;
        default:
          applySel(convertBlock(session, index, name as TargetKind));
      }
    };
    return () => {
      if (commandRef) commandRef.current = null;
    };
  }, [commandRef, active, session, applySel, focusSel, onDirty]);

  /* 活动块滚出视口 → 保持可见（输入时不被窗口回收） */
  useEffect(() => {
    if (!active) return;
    recomputeRange();
  }, [active, recomputeRange]);

  const visible = useMemo(() => {
    const out: { block: Block; index: number }[] = [];
    for (let i = range.start; i < Math.min(range.end, session.blocks.length); i++) {
      out.push({ block: session.blocks[i], index: i });
    }
    return out;
  }, [session, session.rev, range.start, range.end, version]);


  (window as unknown as { __piViewport?: unknown }).__piViewport = () => ({
    range,
    total,
    prefixHead: [prefix[0], prefix[10], prefix[50], prefix[prefix.length - 1]],
    scrollTop: scrollRef.current?.scrollTop ?? -1,
    clientH: scrollRef.current?.clientHeight ?? -1,
    measured: measuredRef.current.size,
    blocks: session.blocks.length,
  });

  return (
    <div
      className="doc-scroll"
      ref={scrollRef}
      style={{ ["--doc-zoom" as string]: String(zoom) }}
    >
      <div
        className="doc-page"
        ref={pageRef}
        style={{ width: `${widthPercent}%`, maxWidth: 960 }}
      >
        <div style={{ height: prefix[Math.min(range.start, prefix.length - 1)] }} />
        {visible.map(({ block, index }) => (
          <BlockView
            key={block.id}
            session={session}
            block={block}
            index={index}
            active={active}
            editable={!readOnly && mode === "wysiwyg"}
            theme={theme}
            handlers={liveHandlers}
          />
        ))}
        <div style={{ height: Math.max(0, total - prefix[Math.min(range.end, prefix.length - 1)]) }} />
      </div>
      {slash && (
        <SlashMenu
          style={{ left: slash.left, top: slash.top }}
          onPick={applySlash}
          onClose={() => {
            setSlash(null);
            slashRef.current = null;
          }}
        />
      )}
    </div>
  );
}

function lowerBound(prefix: number[], value: number): number {
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const SLASH_ITEMS: { kind: TargetKind; labelKey: string; icon: string }[] = [
  { kind: "paragraph", labelKey: "editor.blockParagraph", icon: "¶" },
  { kind: "h1", labelKey: "editor.blockH1", icon: "H1" },
  { kind: "h2", labelKey: "editor.blockH2", icon: "H2" },
  { kind: "h3", labelKey: "editor.blockH3", icon: "H3" },
  { kind: "list", labelKey: "editor.blockBullet", icon: "•" },
  { kind: "ordered", labelKey: "editor.blockOrdered", icon: "1." },
  { kind: "task", labelKey: "editor.blockTask", icon: "☑" },
  { kind: "quote", labelKey: "editor.blockQuote", icon: "❝" },
  { kind: "callout", labelKey: "editor.blockCallout", icon: "!" },
  { kind: "code", labelKey: "editor.blockCode", icon: "</>" },
  { kind: "math", labelKey: "editor.blockMath", icon: "∑" },
  { kind: "mermaid", labelKey: "editor.blockDiagram", icon: "◈" },
  { kind: "table", labelKey: "editor.blockTable", icon: "▦" },
  { kind: "hr", labelKey: "editor.blockDivider", icon: "—" },
];

function SlashMenu({
  style,
  onPick,
  onClose,
}: {
  style: { left: number; top: number };
  onPick(kind: TargetKind): void;
  onClose(): void;
}) {
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((c) => Math.min(SLASH_ITEMS.length - 1, c + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        onPick(SLASH_ITEMS[cursor].kind);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cursor, onPick, onClose]);

  return (
    <div className="popover slash-menu" style={{ left: style.left, top: style.top }} ref={ref}>
      <div className="popover-title">{t("editor.slashHint")}</div>
      <div className="slash-list">
        {SLASH_ITEMS.map((item, index) => (
          <button
            key={item.kind}
            className={"slash-item" + (index === cursor ? " is-active" : "")}
            onMouseEnter={() => setCursor(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item.kind)}
          >
            <span className="slash-icon">{item.icon}</span>
            <span>{t(item.labelKey as Parameters<typeof t>[0])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}