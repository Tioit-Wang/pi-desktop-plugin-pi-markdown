import { useEffect, useRef, useState } from "react";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { Crepe } from "@milkdown/crepe";
import mermaid from "mermaid";
import { EditorStatus, parserCtx, schemaCtx } from "@milkdown/kit/core";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import { DOMSerializer } from "@milkdown/kit/prose/model";
import { prism, prismConfig } from "@milkdown/plugin-prism";
import { replaceAll } from "@milkdown/utils";
import { basicSetup } from "codemirror";
import type { ExportKind, NoteNode, ThemeMode } from "../types";
import { EXTERNAL_NOTE_ID } from "../types";
import { registerRefractorLanguages } from "../generated/refractor-imports";
import { toast } from "../lib/toast";
import { getLocale, t } from "../lib/i18n";
import { useAppDispatch } from "../store";

export interface EditorApi {
  getMarkdown(): string;
  /** 由 Markdown 源码经编辑器 parser+serializer 生成完整 HTML（导出用，含 KaTeX 行内公式） */
  getHtmlFromMarkdown(markdown: string): string;
  scrollToHeading(index: number): void;
}

interface Props {
  note: NoteNode | null;
  registerApi(api: EditorApi | null): void;
  onHeadingChange(index: number): void;
  onExport(kind: ExportKind): void;
  theme: ThemeMode;
  sidebarOpen: boolean;
  onToggleSidebar(): void;
  /** 单文件模式（Agent 工具 open_file 打开的外部文件） */
  external: boolean;
  onExitExternal(): void;
}

/** 标题栏导出菜单项（与侧边栏右键菜单同款图标/文案） */
const EXPORT_ITEMS: { kind: ExportKind; key: string; icon: string }[] = [
  {
    kind: "md",
    key: "editor.exportMarkdown",
    icon: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z",
  },
  {
    kind: "html",
    key: "editor.exportHtml",
    icon: "M8 9l-3 3 3 3M16 9l3 3-3 3",
  },
  {
    kind: "png",
    key: "editor.exportImage",
    icon: "M3 5h18v14H3zM3 15l5-5 4 4 4-4 5 5",
  },
];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** HTML 转义（mermaid 错误信息展示用） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 图片 → data URL（图片内嵌进正文，随笔记一起保存/导出） */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (file.size > MAX_IMAGE_BYTES) {
      toast(t("editor.imageTooLarge"), "error");
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => {
      toast(t("editor.imageReadFailed"), "error");
      resolve("");
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Milkdown Crepe：真正的 Markdown 所见即所得编辑器。
 *
 * 输入即解析——`# ` 出标题、`- ` 出列表、`- [ ]` 出任务、
 * `> ` 出引用、` ``` ` 出代码块、`$…$` / `$$…$$` 出公式，
 * 全部由 ProseMirror 输入规则原生完成（含中文输入法组合提交），
 * 不再需要任何 DOM 补丁。
 */
export default function EditorPane({
  note,
  registerApi,
  onHeadingChange,
  onExport,
  theme,
  sidebarOpen,
  onToggleSidebar,
  external,
  onExitExternal,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null); // Crepe 挂载点
  const scrollRef = useRef<HTMLDivElement>(null); // 滚动容器
  const crepeRef = useRef<Crepe | null>(null);
  const apiRef = useRef<EditorApi | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const noteRef = useRef<NoteNode | null>(note);
  noteRef.current = note;
  const themeRef = useRef<ThemeMode>(theme);
  themeRef.current = theme;
  const headingIndexRef = useRef(-1);
  const suppressNextRef = useRef(false);
  const scrollTimerRef = useRef(0);
  const callbacksRef = useRef({ onHeadingChange });
  callbacksRef.current = { onHeadingChange };
  const dispatch = useAppDispatch();
  // 当前界面语言：语言切换会触发重渲染，本组件据此重建编辑器文案
  const locale = getLocale();

  /* ---------- 标题栏导出菜单（点击外部 / Esc 关闭） ---------- */
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        exportBoxRef.current &&
        !exportBoxRef.current.contains(e.target as Node)
      ) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [exportMenuOpen]);

  /* ---------- Mermaid：代码块语言 mermaid → 源码可编辑 + 图表实时渲染 ---------- */
  const mermaidThemeRef = useRef<ThemeMode | null>(null);
  const mermaidSeqRef = useRef(0);
  const mermaidTimerRef = useRef(0);

  const renderCodeBlockPreview = (
    language: string,
    content: string,
    applyPreview: (value: null | string | HTMLElement) => void,
  ): null | undefined => {
    if ((language || "").toLowerCase() !== "mermaid" || !content.trim()) {
      return null;
    }
    const seq = ++mermaidSeqRef.current;
    window.clearTimeout(mermaidTimerRef.current);
    mermaidTimerRef.current = window.setTimeout(async () => {
      const theme: ThemeMode = themeRef.current;
      if (mermaidThemeRef.current !== theme) {
        mermaidThemeRef.current = theme;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
        });
      }
      try {
        const { svg } = await mermaid.render(`pi-md-mermaid-${seq}`, content);
        if (seq === mermaidSeqRef.current) applyPreview(svg);
      } catch (err) {
        if (seq === mermaidSeqRef.current) {
          applyPreview(
            `<div class="mermaid-error">${escapeHtml(
              t("editor.mermaidError", {
                msg: (err as Error)?.message ?? String(err),
              }),
            )}</div>`,
          );
        }
      }
    }, 300);
    return undefined; // 异步渲染 → 组件先显示 previewLoading
  };

  /** 代码块 CodeMirror 扩展（随主题切换 oneDark 深色编辑器） */
  const cmExtensions = (dark: boolean) => [
    keymap.of(defaultKeymap.concat(indentWithTab)),
    basicSetup,
    ...(dark ? [oneDark] : []),
  ];

  /* ---------- 滚动 → 高亮当前大纲标题 ---------- */
  useEffect(() => {
    const handleScroll = () => {
      window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        const headings = Array.from(
          scroller.querySelectorAll("h1,h2,h3,h4,h5"),
        ) as HTMLElement[];
        let idx = -1;
        const top = scroller.getBoundingClientRect().top + 80;
        for (let i = 0; i < headings.length; i++) {
          if (headings[i].getBoundingClientRect().top <= top) idx = i;
          else break;
        }
        if (idx !== headingIndexRef.current) {
          headingIndexRef.current = idx;
          callbacksRef.current.onHeadingChange(idx);
        }
      }, 80);
    };
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.clearTimeout(scrollTimerRef.current);
    };
  }, []);

  /* ---------- 创建编辑器（一次；语言切换时按新 locale 重建） ---------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || crepeRef.current) return;
    let cancelled = false;

    const crepe = new Crepe({
      root: host,
      defaultValue: "",
      // 注意：CodeMirror 必须保持启用——Crepe 的 LaTeX 公式功能硬性依赖它
      // （latex feature 在未启用 CodeMirror 时直接抛错，编辑器将无法初始化）。
      featureConfigs: {
        [Crepe.Feature.CodeMirror]: {
          theme: themeRef.current === "dark" ? oneDark : undefined,
          // 无预览模式：代码块始终显示 CodeMirror 编辑态，插入/点击即可直接输入，
          // 不需要“编辑”按钮切换。
          previewOnlyByDefault: false,
          // 普通代码块不渲染预览（返回 null → 无预览面板与切换按钮）；
          // mermaid 语言 → 实时渲染图表（300ms 防抖，随主题深浅切换）；
          // latex 语言由 latex feature 接管渲染 KaTeX 公式。
          renderPreview: renderCodeBlockPreview,
          previewLoading: t("editor.renderLoading"),
          copyText: t("editor.copy"),
          searchPlaceholder: t("editor.searchLanguage"),
          noResultText: t("editor.noLanguage"),
          previewToggleText: (previewOnlyMode) =>
            previewOnlyMode ? t("editor.edit") : t("editor.hide"),
          previewLabel: t("editor.preview"),
        },
        [Crepe.Feature.Placeholder]: {
          text: t("editor.placeholder"),
          mode: "doc",
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: fileToDataURL,
          proxyDomURL: (url) => url,
        },
        [Crepe.Feature.LinkTooltip]: {
          inputPlaceholder: t("editor.linkPlaceholder"),
        },
        [Crepe.Feature.Latex]: {
          katexOptions: { throwOnError: false },
        },
        // 斜杠菜单与块菜单文案随宿主语言
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: t("editor.blockText"),
            text: { label: t("editor.blockParagraph") },
            h1: { label: t("editor.blockH1") },
            h2: { label: t("editor.blockH2") },
            h3: { label: t("editor.blockH3") },
            h4: { label: t("editor.blockH4") },
            h5: { label: t("editor.blockH5") },
            h6: { label: t("editor.blockH6") },
            quote: { label: t("editor.blockQuote") },
            divider: { label: t("editor.blockDivider") },
          },
          listGroup: {
            label: t("editor.blockList"),
            bulletList: { label: t("editor.blockBullet") },
            orderedList: { label: t("editor.blockOrdered") },
            taskList: { label: t("editor.blockTask") },
          },
          advancedGroup: {
            label: t("editor.blockAdvanced"),
            image: { label: t("editor.blockImage") },
            codeBlock: { label: t("editor.blockCode") },
            table: { label: t("editor.blockTable") },
            math: { label: t("editor.blockMath") },
          },
        },
      },
    });
    crepeRef.current = crepe;

    // Prism 语法高亮：注册全部 refractor 语言（297 种，随包离线）
    crepe.editor.config((ctx) => {
      ctx.update(prismConfig.key, (prev) => ({
        ...prev,
        configureRefractor: (refractor) =>
          registerRefractorLanguages(refractor),
      }));
    });
    crepe.editor.use(prism);

    // 内容变更 → 回写 store（笔记切换由 loadNote 抑制；
    // 单文件模式 → externalSave，不进入笔记树）
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (suppressNextRef.current) {
          suppressNextRef.current = false;
          return;
        }
        const id = noteIdRef.current;
        if (id === EXTERNAL_NOTE_ID) {
          dispatch({ type: "externalSave", content: markdown });
        } else if (id) {
          dispatch({ type: "setContent", id, content: markdown });
        }
      });
    });

    /* 切换/加载笔记内容（编辑器创建完成后方可调用） */
    const loadNote = (target: NoteNode | null) => {
      const current = crepeRef.current;
      if (!current || current.editor.status !== EditorStatus.Created) return;
      noteIdRef.current = target?.id ?? null;
      headingIndexRef.current = -1;
      callbacksRef.current.onHeadingChange(-1);
      suppressNextRef.current = true;
      current.editor.action(replaceAll(target?.content ?? ""));
      suppressNextRef.current = false;
      scrollRef.current?.scrollTo({ top: 0 });
    };

    const api: EditorApi = {
      getMarkdown: () => crepeRef.current?.getMarkdown() ?? "",
      getHtmlFromMarkdown: (markdown: string) => {
        const current = crepeRef.current;
        if (!current || current.editor.status !== EditorStatus.Created) {
          return "";
        }
        return current.editor.action((ctx) => {
          const doc = ctx.get(parserCtx)(markdown);
          const div = document.createElement("div");
          const fragment = DOMSerializer.fromSchema(ctx.get(schemaCtx))
            .serializeFragment(doc.content);
          div.appendChild(fragment);
          return div.innerHTML;
        });
      },
      scrollToHeading: (index) => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        const headings = Array.from(
          scroller.querySelectorAll("h1,h2,h3,h4,h5"),
        ) as HTMLElement[];
        headings[index]?.scrollIntoView({ block: "start", behavior: "smooth" });
      },
    };
    apiRef.current = api;

    crepe
      .create()
      .then(() => {
        if (cancelled) return;
        registerApi(api);
        loadNote(noteRef.current);
      })
      .catch((err: unknown) => {
        toast(
          t("toast.editorInitFailed", {
            msg: (err as Error)?.message ?? String(err),
          }),
          "error",
        );
      });

    return () => {
      cancelled = true;
      registerApi(null);
      apiRef.current = null;
      const current = crepeRef.current;
      crepeRef.current = null;
      void current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  /* ---------- 主题切换 → 更新代码块 CodeMirror 扩展（新初始化的块生效） ---------- */
  useEffect(() => {
    const current = crepeRef.current;
    if (!current || current.editor.status !== EditorStatus.Created) return;
    current.editor.action((ctx) => {
      const prev = ctx.get(codeBlockConfig.key);
      ctx.set(codeBlockConfig.key, {
        ...prev,
        extensions: cmExtensions(theme === "dark"),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  /* ---------- 切换笔记 ---------- */
  useEffect(() => {
    const current = crepeRef.current;
    if (!current || current.editor.status !== EditorStatus.Created) return;
    noteIdRef.current = note?.id ?? null;
    headingIndexRef.current = -1;
    callbacksRef.current.onHeadingChange(-1);
    suppressNextRef.current = true;
    current.editor.action(replaceAll(note?.content ?? ""));
    suppressNextRef.current = false;
    scrollRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-bg">
      {external && (
        <div className="flex shrink-0 items-center gap-3 border-b border-edge bg-panel px-5 py-2 text-xs">
          <span className="flex min-w-0 items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
            <span className="shrink-0 font-medium text-ink">
              {t("external.banner")}
            </span>
            <span className="truncate text-muted">{note?.title}</span>
            <span className="shrink-0 text-faint">{t("external.saveHint")}</span>
          </span>
          <button
            onClick={onExitExternal}
            className="ml-auto shrink-0 border border-edge2 px-3 py-1 text-muted transition-colors hover:border-edge2 hover:text-ink"
          >
            {t("external.exit")}
          </button>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-5 pb-2 pt-3">
        <button
          onClick={onToggleSidebar}
          title={
            sidebarOpen ? t("editor.collapseSidebar") : t("editor.expandSidebar")
          }
          aria-label={
            sidebarOpen ? t("editor.collapseSidebar") : t("editor.expandSidebar")
          }
          className="flex shrink-0 items-center text-faint transition-colors hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {sidebarOpen ? (
              <path d="M15 18l-6-6 6-6" />
            ) : (
              <path d="M9 18l6-6-6-6" />
            )}
          </svg>
        </button>
        <input
          value={note?.title ?? ""}
          onChange={(e) =>
            note &&
            !external &&
            dispatch({ type: "rename", id: note.id, name: e.target.value })
          }
          placeholder={t("editor.noteTitlePlaceholder")}
          disabled={!note}
          readOnly={external}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-ink outline-none placeholder:text-faint disabled:cursor-default"
        />
        {/* 标题栏右侧：导出菜单（Markdown / HTML / 图像） */}
        <div ref={exportBoxRef} className="relative shrink-0">
          <button
            onClick={() => setExportMenuOpen((v) => !v)}
            disabled={!note}
            title={t("editor.exportNote")}
            aria-label={t("editor.exportNote")}
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            className="flex items-center rounded p-1.5 text-faint transition-colors hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:text-faint"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 3v10M8 9l4 4 4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
          </button>
          {exportMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 w-[180px] border border-edge2 bg-panel2 py-1 shadow-lg"
            >
              {EXPORT_ITEMS.map((item) => (
                <button
                  key={item.kind}
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-panel"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExport(item.kind);
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0 opacity-80"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d={item.icon} />
                  </svg>
                  {t(item.key as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 滚动容器常驻；Crepe 挂载点随笔记切换保持稳定 */}
      <div ref={scrollRef} className="pi-md-scroll min-h-0 flex-1 overflow-y-auto">
        <div ref={hostRef} className="h-full" />
      </div>
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
          <p className="text-sm">{t("editor.emptyHint")}</p>
          <button
            onClick={() => dispatch({ type: "newNote", parentId: null })}
            className="bg-accent px-4 py-2 text-xs text-onaccent hover:bg-accent2"
          >
            {t("common.newNote")}
          </button>
        </div>
      )}
    </main>
  );
}
