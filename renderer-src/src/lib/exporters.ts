import html2canvas from "html2canvas";
import katex from "katex";
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
 * 3. 其余代码块 → refractor 重新语法高亮。
 *
 * 不依赖实时编辑器 DOM——离屏的代码块/公式在编辑器里会被回收为占位符，
 * 用实时 DOM 导出会得到原始 LaTeX 源码与 Vue 组件噪声。
 */
function renderBlockHtml(
  markdown: string,
  getHtmlFromMarkdown: (md: string) => string,
): string {
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

export function exportNote(
  kind: ExportKind,
  note: NoteNode,
  getMarkdown: () => string,
  getHtmlFromMarkdown: (md: string) => string,
): Promise<void> | void {
  const markdown = getMarkdown();
  if (kind === "md") {
    download(
      `${safeName(note.title)}.md`,
      markdown,
      "text/markdown;charset=utf-8",
    );
    return;
  }
  const bodyHtml = renderBlockHtml(markdown, getHtmlFromMarkdown);
  if (kind === "html") {
    const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(note.title)}</title>
<style>
${collectStyles()}
body{background:#ffffff;color:#1b2430;padding:0;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
</style>
</head>
<body>
<div class="milkdown pi-md-export"
  style="--crepe-color-background:#ffffff;--crepe-color-on-background:#1b2430;--crepe-color-inline-code:#d6336c;--crepe-color-primary:#0969da;--crepe-color-inline-area:#eef1f5;--crepe-color-selected:#e2e8f0;--crepe-color-outline:#cbd5e1;--crepe-color-surface:#ffffff;--crepe-color-surface-low:#f6f8fa;--crepe-color-on-surface:#1b2430;--crepe-color-on-surface-variant:#57606a;--crepe-color-hover:#eef1f5">
  <div class="editor ProseMirror" style="padding:40px 24px;max-width:860px;margin:0 auto">${bodyHtml}</div>
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
      "position:fixed;left:-9999px;top:0;width:860px;background:#ffffff;color:#1b2430;box-sizing:border-box;z-index:-1;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;" +
      "--crepe-color-background:#ffffff;--crepe-color-on-background:#1b2430;--crepe-color-inline-code:#d6336c;--crepe-color-primary:#0969da;--crepe-color-inline-area:#eef1f5;--crepe-color-selected:#e2e8f0;--crepe-color-outline:#cbd5e1;--crepe-color-surface:#ffffff;--crepe-color-surface-low:#f6f8fa;--crepe-color-on-surface:#1b2430;--crepe-color-on-surface-variant:#57606a;--crepe-color-hover:#eef1f5";
    wrap.innerHTML = `<div class="editor ProseMirror" style="padding:48px">${bodyHtml}</div>`;
    document.body.appendChild(wrap);
    try {
      const canvas = await html2canvas(wrap, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
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
