import { useEffect, useRef } from "react";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { Crepe } from "@milkdown/crepe";
import { EditorStatus, parserCtx, schemaCtx } from "@milkdown/kit/core";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import { DOMSerializer } from "@milkdown/kit/prose/model";
import { prism, prismConfig } from "@milkdown/plugin-prism";
import { replaceAll } from "@milkdown/utils";
import { basicSetup } from "codemirror";
import type { NoteNode, ThemeMode } from "../types";
import { registerRefractorLanguages } from "../generated/refractor-imports";
import { highlightCodeHtml } from "../lib/exporters";
import { toast } from "../lib/toast";
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
  theme: ThemeMode;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 图片 → data URL（图片内嵌进正文，随笔记一起保存/导出） */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (file.size > MAX_IMAGE_BYTES) {
      toast("图片超过 8MB，未插入", "error");
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => {
      toast("图片读取失败", "error");
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
  theme,
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

  /* ---------- 创建编辑器（一次） ---------- */
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
          // 代码块默认显示渲染结果（预览即所得）：LaTeX 块直接显示 KaTeX 公式、
          // 普通代码块显示 Prism 高亮结果；点工具条按钮切换到编辑。
          previewOnlyByDefault: true,
          // 普通代码块预览：Prism（refractor）高亮；latex 由 latex feature 接管为 KaTeX
          renderPreview: (language, content) =>
            highlightCodeHtml(language, content),
          copyText: "复制",
          searchPlaceholder: "搜索语言…",
          noResultText: "无匹配语言",
          previewToggleText: (previewOnlyMode) =>
            previewOnlyMode ? "编辑" : "隐藏",
          previewLabel: "预览",
        },
        [Crepe.Feature.Placeholder]: {
          text: "开始写作…（# 空格 建标题，/ 唤起菜单，$…$ 行内公式）",
          mode: "doc",
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: fileToDataURL,
          proxyDomURL: (url) => url,
        },
        [Crepe.Feature.LinkTooltip]: {
          inputPlaceholder: "输入链接地址…",
        },
        [Crepe.Feature.Latex]: {
          katexOptions: { throwOnError: false },
        },
        // 斜杠菜单与块菜单中文化
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: "文本",
            text: { label: "正文" },
            h1: { label: "标题 1" },
            h2: { label: "标题 2" },
            h3: { label: "标题 3" },
            h4: { label: "标题 4" },
            h5: { label: "标题 5" },
            h6: { label: "标题 6" },
            quote: { label: "引用" },
            divider: { label: "分割线" },
          },
          listGroup: {
            label: "列表",
            bulletList: { label: "无序列表" },
            orderedList: { label: "有序列表" },
            taskList: { label: "任务列表" },
          },
          advancedGroup: {
            label: "高级",
            image: { label: "图片" },
            codeBlock: { label: "代码块" },
            table: { label: "表格" },
            math: { label: "公式" },
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

    // 内容变更 → 回写 store（笔记切换由 loadNote 抑制）
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (suppressNextRef.current) {
          suppressNextRef.current = false;
          return;
        }
        const id = noteIdRef.current;
        if (id) dispatch({ type: "setContent", id, content: markdown });
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
          `编辑器初始化失败：${(err as Error)?.message ?? String(err)}`,
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
  }, []);

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
          <p className="text-sm">从左侧选择一篇笔记，或新建一篇开始写作</p>
          <button
            onClick={() => dispatch({ type: "newNote", parentId: null })}
            className="bg-accent px-4 py-2 text-xs text-onaccent hover:bg-accent2"
          >
            新建笔记
          </button>
        </div>
      )}
    </main>
  );
}
