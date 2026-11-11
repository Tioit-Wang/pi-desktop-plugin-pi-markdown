/**
 * 单个块的渲染（nomo: nomo_mark/view 的窗口片段 → 控件）。
 *
 * 两种形态：
 * - 渲染态：markdown 标记隐藏，输出真实排版；每个片段带 data-o 供点击定位。
 * - 编辑态（当前光标所在块）：contenteditable 直接承载块原文，DOM 文本 == 源码，
 *   光标/选区与源码偏移 1:1，IME 与原生输入行为完全可预测。
 *   只有当前块处于编辑态，其余块保持渲染态 —— 这就是 nomo「光标附近显示标记」
 *   的块级实现，也是性能关键：任何时刻只有 1 个可编辑元素。
 */
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { parseBlock } from "../../core/md/blocks";
import { parseInline } from "../../core/md/inline";
import type { Block } from "../../core/md/types";
import type { DocSession } from "../../core/doc/session";
import { Inline } from "./Inline";
import {
  CodeBlock,
  FrontMatterBlock,
  ImageBlock,
  MathBlock,
  MermaidBlock,
  TableBlock,
} from "./Blocks";
import { setCaret } from "./caret";
import { t } from "../../lib/i18n";

export interface ActiveState {
  index: number;
  sel: { start: number; end: number };
  token: number;
}

export interface BlockHandlers {
  activate(index: number, offset: number, editable: boolean): void;
  toggleTask(index: number): void;
  setLang(index: number, lang: string): void;
  copy(text: string): void;
  dirty(): void;
  keyDown(event: React.KeyboardEvent<HTMLDivElement>, index: number): void;
  paste(event: React.ClipboardEvent<HTMLDivElement>, index: number): void;
  blur(index: number): void;
  composing(value: boolean): void;
  measure(index: number, height: number): void;
}

interface Props {
  session: DocSession;
  block: Block;
  index: number;
  active: ActiveState | null;
  editable: boolean;
  theme: string;
  handlers: BlockHandlers;

}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function BlockEditor({
  session,
  index,
  sid,
  sel,
  token,
  handlers,
}: {
  session: DocSession;
  index: number;
  sid: string;
  sel: { start: number; end: number };
  token: number;
  handlers: BlockHandlers;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raw = session.blocks[index]?.raw ?? "";
    if (el.textContent !== raw) el.textContent = raw;
    setCaret(el, sel.start, sel.end);
    el.focus({ preventScroll: true });
    // 仅在换块 / 需要重新定位光标时同步 DOM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, token]);

  return (
    <div
      ref={ref}
      className="blk-editable"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={t("editor.placeholder")}
      onInput={() => {
        const el = ref.current;
        if (!el) return;
        session.setRaw(index, el.textContent ?? "", { silent: true });
        handlers.dirty();
      }}
      onKeyDown={(event) => handlers.keyDown(event, index)}
      onPaste={(event) => handlers.paste(event, index)}
      onBlur={() => handlers.blur(index)}
      onCompositionStart={() => handlers.composing(true)}
      onCompositionEnd={() => handlers.composing(false)}
      onMouseDown={(event) => event.stopPropagation()}
    />
  );
}

const RenderedBody = memo(function RenderedBody({
  block,
  index,
  theme,
  handlers,
}: {
  block: Block;
  index: number;
  theme: string;
  handlers: BlockHandlers;
}) {
  const info = useMemo(() => parseBlock(block.raw), [block.raw]);
  const base = info.bodyOffset;

  switch (info.kind) {
    case "heading": {
      const level = Math.min(6, Math.max(1, info.level ?? 1));
      const Tag = ("h" + level) as keyof JSX.IntrinsicElements;
      return (
        <Tag className={"doc-h doc-h" + level}>
          <Inline tokens={parseInline(info.text)} base={base} />
        </Tag>
      );
    }
    case "list": {
      const list = info.list!;
      return (
        <div className="doc-li" style={{ paddingLeft: list.indent * 12 }}>
          <span className={"li-mark" + (list.ordered ? " is-ordered" : "")}>
            {list.ordered ? list.number + "." : "•"}
          </span>
          <span className="li-body">
            <Inline tokens={parseInline(info.text)} base={base} />
          </span>
        </div>
      );
    }
    case "task": {
      const list = info.list!;
      return (
        <div className="doc-li doc-task" style={{ paddingLeft: list.indent * 12 }}>
          <button
            className={"task-box" + (list.checked ? " is-checked" : "")}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              handlers.toggleTask(index);
            }}
            aria-label={t("editor.toggleTask")}
          >
            {list.checked && (
              <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                <path
                  d="M3 8.5l3.2 3.2L13 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          <span className={"li-body" + (list.checked ? " is-done" : "")}>
            <Inline tokens={parseInline(info.text)} base={base} />
          </span>
        </div>
      );
    }
    case "quote":
      return (
        <blockquote className="doc-quote">
          <Inline tokens={parseInline(info.quote?.body ?? info.text)} base={base} />
        </blockquote>
      );
    case "callout": {
      const type = (info.quote?.callout ?? "note").toLowerCase();
      return (
        <div className={"doc-callout callout-" + type}>
          <div className="callout-head">
            <span className="callout-icon" />
            <span className="callout-title">{t(("callout." + type) as Parameters<typeof t>[0])}</span>
          </div>
          <div className="callout-body">
            <Inline tokens={parseInline(info.quote?.body ?? "")} base={base} />
          </div>
        </div>
      );
    }
    case "code": {
      const code = info.code!;
      if (code.lang === "mermaid") {
        return <MermaidBlock code={code.body} theme={theme} />;
      }
      if (code.lang === "math" || code.lang === "latex" || code.lang === "katex") {
        return <MathBlock tex={code.body} />;
      }
      return (
        <CodeBlock code={code} onCopy={handlers.copy} onSetLang={(lang) => handlers.setLang(index, lang)} />
      );
    }
    case "math":
      return <MathBlock tex={info.text} />;
    case "table":
      return <TableBlock table={info.table!} base={0} />;
    case "hr":
      return <hr className="doc-hr" />;
    case "image":
      return <ImageBlock src={info.image!.src} alt={info.image!.alt} />;
    case "frontmatter":
      return <FrontMatterBlock pairs={info.frontmatter ?? []} />;
    case "html":
      return (
        <div className="code-card is-html">
          <div className="code-head">
            <span className="code-lang">HTML</span>
          </div>
          <pre className="code-body">
            <code>{block.raw}</code>
          </pre>
        </div>
      );
    case "empty":
      return <div className="doc-empty-line" />;
    default:
      return (
        <p className="doc-p">
          <Inline tokens={parseInline(block.raw)} base={0} />
        </p>
      );
  }
});

function BlockViewImpl({ session, block, index, active, editable, theme, handlers }: Props) {
  const info = useMemo(() => parseBlock(block.raw), [block.raw]);
  const isActive = !!active && active.index === index && editable;
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    handlers.measure(index, el.offsetHeight);
  });

  return (
    <div
      ref={wrapRef}
      className={cx("blk", "blk-" + info.kind, isActive && "is-active")}
      data-index={index}
      onMouseDown={(event) => {
        if (!editable) return;
        const target = event.target as HTMLElement;
        if (target.closest("button, input, a, textarea, .code-lang-menu")) return;
        event.preventDefault();
        const el = wrapRef.current;
        if (!el) return;
        const offset =
          info.kind === "code" || info.kind === "math" || info.kind === "hr" || info.kind === "image"
            ? 0
            : Math.min(block.raw.length, Math.max(0, pointOffset(el, event.clientX, event.clientY)));
        handlers.activate(index, offset, true);
      }}
    >
      {isActive ? (
        <BlockEditor
          session={session}
          index={index}
          sid={block.id}
          sel={active!.sel}
          token={active!.token}
          handlers={handlers}
        />
      ) : (
        <RenderedBody block={block} index={index} theme={theme} handlers={handlers} />
      )}
    </div>
  );
}

function pointOffset(el: HTMLElement, x: number, y: number): number {
  const anyDoc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let nodeOffset = 0;
  if (anyDoc.caretRangeFromPoint) {
    const range = anyDoc.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      nodeOffset = range.startOffset;
    }
  } else if (anyDoc.caretPositionFromPoint) {
    const pos = anyDoc.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      nodeOffset = pos.offset;
    }
  }
  if (!node || !el.contains(node)) return 0;
  let anchor: HTMLElement | null = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  let base = 0;
  while (anchor && anchor !== el) {
    const attr = anchor.getAttribute("data-o");
    if (attr !== null) {
      base = Number(attr) || 0;
      break;
    }
    anchor = anchor.parentElement;
  }
  const scope = anchor && anchor !== el ? anchor : el;
  let sum = 0;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode() as Text | null;
  while (text) {
    if (text === node) return base + sum + nodeOffset;
    sum += text.data.length;
    text = walker.nextNode() as Text | null;
  }
  return base + sum;
}

export const BlockView = memo(BlockViewImpl);