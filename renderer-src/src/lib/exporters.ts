import html2canvas from "html2canvas";
import katex from "katex";
import mermaid from "mermaid";
import { refractor } from "refractor";
import type { ExportKind, NoteNode } from "../types";
import { registerRefractorLanguages } from "../generated/refractor-imports";
import { hastToHtml } from "./hast";

/** 惰性注册全部 refractor（Prism）语言（编辑器初始化时已注册过，此处为防御性兜底） */
let refractorReady = false;
function ensureRefractorLanguages(): void {
  if (refractorReady) return;
  refractorReady = true;
  try {
    registerRefractorLanguages(refractor);
  } catch {
    /* 注册失败不阻塞导出（未知语言会原样输出） */
  }
}

/** refractor 高亮代码为 HTML（带 .token 着色），失败返回 null */
export function highlightCodeHtml(
  language: string,
  content: string,
): string | null {
  const lang = (language || "").toLowerCase();
  if (!lang || !content.trim()) return null;
  try {
    const root = refractor.highlight(content, lang) as {
      children?: Parameters<typeof hastToHtml>[0][];
    };
    const body = (root.children ?? []).map(hastToHtml).join("");
    return `<pre class="code-preview"><code class="language-${lang}">${body}</code></pre>`;
  } catch {
    return null;
  }
}

/** Mermaid → 内联 SVG（导出用；失败返回 null） */
let mermaidExportReady = false;
let mermaidExportSeq = 0;
async function renderMermaidExportSvg(
  content: string,
): Promise<string | null> {
  if (!mermaidExportReady) {
    mermaidExportReady = true;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
    });
  }
  try {
    const { svg } = await mermaid.render(
      `pi-md-export-${++mermaidExportSeq}`,
      content,
    );
    return svg;
  } catch {
    return null;
  }
}

/** 触发浏览器下载（Blob） */
function download(name: string, data: BlobPart, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeName(title: string): string {
  const cleaned = (title || "未命名笔记")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .trim()
    .slice(0, 80);
  return cleaned || "未命名笔记";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 收集页面全部同源样式，导出的 HTML 自包含（字体已内联为 data URL） */
function collectStyles(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      for (const rule of Array.from(rules)) parts.push(rule.cssText);
    } catch {
      /* 跨域样式表跳过 */
    }
  }
  return parts.join("\n");
}

/**
 * 由 Markdown 源码构建导出用 HTML：
 * 1. 经编辑器 parser+serializer 转换（行内公式由 math_inline.toDOM 渲染为 KaTeX）；
 * 2. 块级公式（code_block lang=latex）→ KaTeX display 公式；
 * 3. mermaid 代码块 → mermaid 渲染为内嵌 SVG；
 * 4. 其余代码块 → refractor 重新语法高亮。
 *
 * 不依赖实时编辑器 DOM——离屏的代码块/公式在编辑器里会被回收为占位符，
 * 用实时 DOM 导出会得到原始 LaTeX 源码与 Vue 组件噪声。
 */
async function renderBlockHtml(
  markdown: string,
  getHtmlFromMarkdown: (md: string) => string,
): Promise<string> {
  ensureRefractorLanguages();
  const div = document.createElement("div");
  div.innerHTML = getHtmlFromMarkdown(markdown);
  const pres = Array.from(
    div.querySelectorAll<HTMLPreElement>("pre[data-language]"),
  );
  for (const pre of pres) {
    const lang = (pre.getAttribute("data-language") ?? "").toLowerCase();
    const code = pre.querySelector("code");
    const text = code?.textContent ?? "";
    if (lang === "mermaid" && text.trim()) {
      const svg = await renderMermaidExportSvg(text);
      if (svg) {
        const temp = document.createElement("div");
        temp.innerHTML = svg;
        pre.replaceWith(temp.firstElementChild as Element);
        continue;
      }
      // 渲染失败：退化为普通代码块，高亮展示源码
    }
    if (lang === "latex" && text.trim()) {
      const wrap = document.createElement("div");
      wrap.className = "katex-display";
      wrap.innerHTML = katex.renderToString(text, {
        displayMode: true,
        throwOnError: false,
      });
      pre.replaceWith(wrap);
      continue;
    }
    if (code) {
      const highlighted = highlightCodeHtml(lang, text);
      if (highlighted) {
        const temp = document.createElement("div");
        temp.innerHTML = highlighted;
        pre.replaceWith(temp.firstElementChild as Element);
      }
    }
  }
  return div.innerHTML;
}

/**
 * 兜底：清除克隆文档中残留的 color(srgb ...) / color-mix() 内联样式。
 *
 * html2canvas 无法解析这两种颜色（现代 Chromium 把 color-mix() 的计算值序列化为
 * `color(srgb r g b / a)`，抛 "Attempting to parse an unsupported color function 'color'"；
 * 旧版则原样返回 color-mix() 同样抛错）。主要防线在 index.css：所有 color-mix
 * 声明已按主题覆盖为等效 rgba()，计算样式不再产生 color(srgb)；这里仅清理
 * html2canvas 克隆阶段从源计算样式内联复制（SVG/伪元素）的残留值。
 */
function sanitizeCloneInlineColors(
  doc: Document,
  scope: HTMLElement | null,
): void {
  if (!scope) return;
  const fix = (v: string): string =>
    v
      .replace(
        /color\(\s*srgb\s+([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)(?:\s*\/\s*([\d.]+%?))?\s*\)/gi,
        (_m, r: string, g: string, b: string, a?: string) => {
          const chan = (x: string) =>
            x.endsWith("%") ? (parseFloat(x) / 100) * 255 : parseFloat(x) * 255;
          const alpha = a
            ? a.endsWith("%")
              ? parseFloat(a) / 100
              : parseFloat(a)
            : 1;
          const rr = Math.round(chan(r));
          const gg = Math.round(chan(g));
          const bb = Math.round(chan(b));
          const aa = Math.round(alpha * 10000) / 10000;
          return aa >= 1
            ? `rgb(${rr}, ${gg}, ${bb})`
            : `rgba(${rr}, ${gg}, ${bb}, ${aa})`;
        },
      )
      .replace(/color-mix\([^)]*\)/gi, "transparent");
  const scan = (el: Element): void => {
    const st = el.getAttribute("style");
    if (st && /color\(|color-mix/i.test(st)) {
      el.setAttribute("style", fix(st));
    }
    for (const child of Array.from(el.children)) scan(child);
  };
  scan(scope);
  void doc;
}

export async function exportNote(
  kind: ExportKind,
  note: NoteNode,
  getMarkdown: () => string,
  getHtmlFromMarkdown: (md: string) => string,
): Promise<void> {
  const markdown = getMarkdown();
  if (kind === "md") {
    download(
      `${safeName(note.title)}.md`,
      markdown,
      "text/markdown;charset=utf-8",
    );
    return;
  }
  const bodyHtml = await renderBlockHtml(markdown, getHtmlFromMarkdown);
  if (kind === "html") {
    const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(note.title)}</title>
<style>
${collectStyles()}
body{background:#ffffff;color:#3d4852;padding:0;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
</style>
</head>
<body>
<div class="milkdown pi-md-export"
  style="--crepe-color-background:#ffffff;--crepe-color-on-background:#3d4852;--crepe-color-inline-code:#c7254e;--crepe-color-primary:#3b82c4;--crepe-color-inline-area:#f1f5f9;--crepe-color-selected:#d4e4f7;--crepe-color-outline:#e2e8f0;--crepe-color-surface:#ffffff;--crepe-color-surface-low:#f8fafc;--crepe-color-on-surface:#3d4852;--crepe-color-on-surface-variant:#5a6872;--crepe-color-hover:#f1f5f9">
  <div class="editor ProseMirror" style="padding:2em 2.5em;max-width:860px;margin:0 auto">${bodyHtml}</div>
</div>
</body>
</html>`;
    download(`${safeName(note.title)}.html`, doc, "text/html;charset=utf-8");
    return;
  }
  // PNG：隐藏容器 + html2canvas
  return (async () => {
    const wrap = document.createElement("div");
    wrap.className = "milkdown pi-md-export";
    wrap.style.cssText =
      "position:fixed;left:-9999px;top:0;width:860px;background:#ffffff;color:#3d4852;box-sizing:border-box;z-index:-1;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;" +
      "--crepe-color-background:#ffffff;--crepe-color-on-background:#3d4852;--crepe-color-inline-code:#c7254e;--crepe-color-primary:#3b82c4;--crepe-color-inline-area:#f1f5f9;--crepe-color-selected:#d4e4f7;--crepe-color-outline:#e2e8f0;--crepe-color-surface:#ffffff;--crepe-color-surface-low:#f8fafc;--crepe-color-on-surface:#3d4852;--crepe-color-on-surface-variant:#5a6872;--crepe-color-hover:#f1f5f9";
    wrap.innerHTML = `<div class="editor ProseMirror" style="padding:2em 2.5em">${bodyHtml}</div>`;
    document.body.appendChild(wrap);
    try {
      const canvas = await html2canvas(wrap, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        onclone: (doc, element) =>
          sanitizeCloneInlineColors(doc, element ?? doc.querySelector(".milkdown")),
      });
      download(
        `${safeName(note.title)}.png`,
        canvas.toDataURL("image/png"),
        "image/png",
      );
    } finally {
      wrap.remove();
    }
  })();
}
