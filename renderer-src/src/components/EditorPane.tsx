import { useEffect, useRef } from "react";
import Editor from "@toast-ui/editor";
import codeSyntaxHighlight from "@toast-ui/editor-plugin-code-syntax-highlight";
import Prism from "prismjs";
import type { NoteNode } from "../types";
import { processKatex } from "../lib/katex";
import { toast } from "../lib/toast";
import { useAppDispatch } from "../store";

type AddImageBlobHook = (
  blob: File | Blob,
  callback: (url: string, text?: string) => void,
) => void;

export interface EditorApi {
  getMarkdown(): string;
  getHtml(): string;
  scrollToHeading(index: number): void;
}

interface Props {
  note: NoteNode | null;
  ready: boolean;
  registerApi(api: EditorApi | null): void;
  onHeadingChange(index: number): void;
}

/** 自定义工具栏：标题、强调、列表（含任务）、表格、图片、链接、代码（含代码块） */
const TOOLBAR_ITEMS = [
  ["heading", "bold", "italic", "strike"],
  ["hr", "quote"],
  ["ul", "ol", "task"],
  ["indent", "outdent"],
  ["table", "image", "link"],
  ["code", "codeblock"],
] as (
  | "heading"
  | "bold"
  | "italic"
  | "strike"
  | "hr"
  | "quote"
  | "ul"
  | "ol"
  | "task"
  | "indent"
  | "outdent"
  | "table"
  | "image"
  | "link"
  | "code"
  | "codeblock"
)[][];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/* ---------- Typora 风格：WYSIWYG 输入 Markdown 标记自动转换 ---------- */

/** 删除块内前 n 个字符（跨文本节点） */
function stripTextNodes(block: HTMLElement, count: number): void {
  let remaining = count;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const tn of nodes) {
    if (remaining <= 0) break;
    const t = tn.nodeValue ?? "";
    const cut = Math.min(t.length, remaining);
    tn.nodeValue = t.slice(cut);
    remaining -= cut;
  }
}

/** 光标在块文本中的绝对偏移 */
function caretOffsetIn(block: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const pre = sel.getRangeAt(0).cloneRange();
  pre.selectNodeContents(block);
  pre.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return pre.toString().length;
}

/** 按绝对偏移放置光标 */
function setCaretByOffset(block: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Text | null = null;
  while (walker.nextNode()) {
    node = walker.currentNode as Text;
    const len = (node.nodeValue ?? "").length;
    if (len >= remaining) break;
    remaining -= len;
    node = null;
  }
  if (!node) return;
  const range = document.createRange();
  range.setStart(node, Math.max(0, Math.min(remaining, (node.nodeValue ?? "").length)));
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

interface MdShortcut {
  re: RegExp;
  markerLen: number;
  cmd: string;
  payload?: unknown;
}

/** 行首 Markdown 标记 → 编辑器命令 */
const MD_SHORTCUTS: MdShortcut[] = [
  { re: /^(#{1,6})\s+/, markerLen: 0, cmd: "heading" }, // 长度动态，见下方
  { re: /^(-|\*)\s+/, markerLen: 2, cmd: "ul" },
  { re: /^\d+[.)]\s+/, markerLen: 0, cmd: "ol" }, // 动态
  { re: /^- \[[ xX]\]\s+/, markerLen: 0, cmd: "task" }, // 动态
  { re: /^>\s+/, markerLen: 2, cmd: "quote" },
  { re: /^(---|\*\*\*|___)\s*$/, markerLen: 0, cmd: "hr" }, // 动态
];

/** WYSIWYG 容器 input 监听：识别行首标记并转换 */
function attachMarkdownShortcuts(ww: HTMLElement, editor: Editor): void {
  // 挂载标志（调试/测试用）
  (window as unknown as { __mdShortcutAttached?: boolean }).__mdShortcutAttached =
    true;
  let composing = false;
  ww.addEventListener("compositionstart", () => {
    composing = true;
  });
  ww.addEventListener("compositionend", () => {
    composing = false;
  });
  ww.addEventListener("input", () => {
    if (composing) return;
    // 延迟到 toastui 处理完当前输入后再转换
    window.setTimeout(() => {
      try {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const anchor = sel.anchorNode;
        const block =
          anchor && anchor.nodeType === Node.TEXT_NODE
            ? (anchor.parentElement as HTMLElement | null)
            : (anchor as HTMLElement | null);
        if (!block || !ww.contains(block)) return;
        // 仅在普通段落/块中转换（标题、列表项、引用内不处理）
        const tag = block.tagName;
        if (tag !== "P" && tag !== "DIV") return;
        const line = block.textContent ?? "";
        let hit: MdShortcut | null = null;
        let markerLen = 0;
        for (const s of MD_SHORTCUTS) {
          const m = line.match(s.re);
          if (!m) continue;
          hit = s;
          if (s.cmd === "heading") {
            markerLen = m[1].length + 1;
          } else if (s.cmd === "ol") {
            markerLen = m[0].length;
          } else if (s.cmd === "task") {
            markerLen = m[0].length;
          } else if (s.cmd === "hr") {
            markerLen = line.length;
          } else {
            markerLen = s.markerLen;
          }
          break;
        }
        if (!hit) return;
        const caretBefore = caretOffsetIn(block);
        stripTextNodes(block, markerLen);
        setCaretByOffset(block, Math.max(0, caretBefore - markerLen));
        const payload =
          hit.cmd === "heading" ? { level: (line.match(/^(#{1,6})\s+/) as RegExpMatchArray)[1].length } : hit.payload;
        editor.exec(hit.cmd, payload);
      } catch {
        /* 转换失败时保持原文，不干扰输入 */
      }
    }, 0);
  });
}

export default function EditorPane({
  note,
  ready,
  registerApi,
  onHeadingChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const apiRef = useRef<EditorApi | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const headingIndexRef = useRef(-1);
  const callbacksRef = useRef({ onHeadingChange });
  callbacksRef.current = { onHeadingChange };
  const dispatch = useAppDispatch();

  /* ---------- 创建编辑器（一次） ---------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!ready || !host || editorRef.current) return;

    const editor = new Editor({
      el: host,
      height: "100%",
      // 仅所见即所得（WYSIWYG）模式
      initialEditType: "wysiwyg",
      hideModeSwitch: true,
      language: "zh-CN",
      autofocus: false,
      plugins: [[codeSyntaxHighlight, { highlighter: Prism }]],
      toolbarItems: TOOLBAR_ITEMS,
      addImageBlobHook: ((
        blob: File | Blob,
        callback: (url: string, text?: string) => void,
      ) => {
        if (blob.size > MAX_IMAGE_BYTES) {
          toast("图片超过 8MB，未插入", "error");
          callback("", "");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => callback(String(reader.result), "");
        reader.onerror = () => {
          toast("图片读取失败", "error");
          callback("", "");
        };
        reader.readAsDataURL(blob);
      }) as AddImageBlobHook,
    });
    editorRef.current = editor;
    // 调试/测试用：暴露编辑器实例（生产无害）
    (window as unknown as { __piEditor?: Editor }).__piEditor = editor;

    // 创建后立即加载当前笔记内容（若 init 已完成；否则由切换笔记 effect 加载）
    if (note) {
      noteIdRef.current = note.id;
      editor.setMarkdown(note.content, false);
    }

    // WYSIWYG 模式：可视容器为 wwEditor（toastui 3.x 的 getEditorElements 键名）
    const preview = editor.getEditorElements().wwEditor;
    previewRef.current = preview ?? null;
    const containers = [preview].filter(Boolean) as HTMLElement[];

    // Typora 风格：输入 # / - / > 等 Markdown 标记自动转换
    if (preview) attachMarkdownShortcuts(preview, editor);

    /* KaTeX：预览 DOM 变化后处理公式 */
    let katexTimer = 0;
    const scheduleKatex = () => {
      window.clearTimeout(katexTimer);
      katexTimer = window.setTimeout(() => {
        for (const c of containers) {
          if (c.isConnected) processKatex(c);
        }
      }, 120);
    };
    const observer = new MutationObserver(scheduleKatex);
    for (const c of containers) {
      observer.observe(c, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    scheduleKatex();

    /* 滚动 → 高亮当前大纲标题 */
    let scrollTimer = 0;
    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const container = previewRef.current;
        if (!container || !container.isConnected) return;
        const headings = Array.from(
          container.querySelectorAll("h1,h2,h3,h4,h5"),
        ) as HTMLElement[];
        let idx = -1;
        const top = container.scrollTop + 10;
        for (let i = 0; i < headings.length; i++) {
          if (headings[i].offsetTop <= top) idx = i;
          else break;
        }
        if (idx !== headingIndexRef.current) {
          headingIndexRef.current = idx;
          callbacksRef.current.onHeadingChange(idx);
        }
      }, 80);
    };
    for (const c of containers) {
      c.addEventListener("scroll", onScroll, { passive: true });
    }

    editor.on("change", () => {
      const id = noteIdRef.current;
      if (id) dispatch({ type: "setContent", id, content: editor.getMarkdown() });
      scheduleKatex();
    });

    const api: EditorApi = {
      getMarkdown: () => editor.getMarkdown(),
      getHtml: () => editor.getHTML(),
      scrollToHeading: (index) => {
        const container = previewRef.current;
        if (!container || !container.isConnected) return;
        const headings = Array.from(
          container.querySelectorAll("h1,h2,h3,h4,h5"),
        ) as HTMLElement[];
        const target = headings[index];
        if (target) {
          container.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
        }
      },
    };
    apiRef.current = api;
    registerApi(api);

    return () => {
      window.clearTimeout(katexTimer);
      window.clearTimeout(scrollTimer);
      observer.disconnect();
      for (const c of containers) c.removeEventListener("scroll", onScroll);
      registerApi(null);
      apiRef.current = null;
      previewRef.current = null;
      editorRef.current = null;
      editor.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* ---------- 切换笔记 ---------- */
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    noteIdRef.current = note?.id ?? null;
    headingIndexRef.current = -1;
    callbacksRef.current.onHeadingChange(-1);
    editor.setMarkdown(note?.content ?? "", false);
    const container = previewRef.current;
    if (container) container.scrollTop = 0;
    const t = window.setTimeout(() => {
      if (previewRef.current) processKatex(previewRef.current);
    }, 160);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-5 pb-2 pt-3">
        <input
          value={note?.title ?? ""}
          onChange={(e) =>
            note && dispatch({ type: "rename", id: note.id, name: e.target.value })
          }
          placeholder="笔记标题"
          disabled={!note}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-ink outline-none placeholder:text-faint disabled:cursor-default"
        />
      </div>
      {/* 宿主 div 常驻：编辑器创建与笔记切换不受 activeNote 空/非空影响 */}
      <div ref={hostRef} className="toastui-editor-dark min-h-0 flex-1" />
      {!note && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg text-muted">
          <svg
            viewBox="0 0 24 24"
            className="h-14 w-14 opacity-40"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
            <path d="M14 3v5h5M9 13h6M9 17h6" />
          </svg>
          <p className="text-sm">从左侧选择一篇笔记，或新建一篇开始写作</p>
          <button
            onClick={() => dispatch({ type: "newNote", parentId: null })}
            className="bg-accent px-4 py-2 text-xs text-black hover:bg-accent2"
          >
            新建笔记
          </button>
        </div>
      )}
    </main>
  );
}
