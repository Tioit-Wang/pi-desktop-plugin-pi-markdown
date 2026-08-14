import { useEffect, useRef } from "react";
import Editor from "@toast-ui/editor";
import codeSyntaxHighlight from "@toast-ui/editor-plugin-code-syntax-highlight";
import Prism from "prismjs";
import type { NoteNode, ViewMode } from "../types";
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
  applyViewMode(mode: ViewMode): void;
  scrollToHeading(index: number): void;
}

interface Props {
  note: NoteNode | null;
  viewMode: ViewMode;
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

export default function EditorPane({
  note,
  viewMode,
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
      initialEditType: "markdown",
      previewStyle: "vertical",
      language: "zh-CN",
      hideModeSwitch: false,
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

    // 创建后立即加载当前笔记内容（若 init 已完成；否则由切换笔记 effect 加载）
    if (note) {
      noteIdRef.current = note.id;
      editor.setMarkdown(note.content, false);
    }

    const preview = editor.getEditorElements().mdPreview;
    const wysiwyg = editor.getEditorElements().wysiwyg;
    previewRef.current = preview ?? null;
    const containers = [preview, wysiwyg].filter(Boolean) as HTMLElement[];

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
      applyViewMode: (mode) => {
        try {
          if (editor.getCurrentMode() !== "markdown") {
            editor.changeMode("markdown", false);
          }
          if (mode === "split") {
            editor.changePreviewStyle("vertical");
          } else {
            editor.changePreviewStyle("tab");
            const cls = mode === "write" ? "tab-editor" : "tab-preview";
            const tab = host.querySelector(
              `.toastui-editor-tabs-item.${cls}`,
            ) as HTMLElement | null;
            tab?.click();
          }
        } catch (err) {
          console.warn("[pi-markdown] applyViewMode", err);
        }
      },
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

  /* ---------- 视图模式 ---------- */
  useEffect(() => {
    apiRef.current?.applyViewMode(viewMode);
  }, [viewMode]);

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
        <span className="shrink-0 text-[10px] text-faint">
          Markdown ⇄ 所见即所得 可随时切换
        </span>
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
