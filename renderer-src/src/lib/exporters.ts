import html2canvas from "html2canvas";
import type { ExportKind, NoteNode } from "../types";
import { processKatex } from "./katex";

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

function buildHtml(getHtml: () => string): string {
  const div = document.createElement("div");
  div.innerHTML = getHtml();
  processKatex(div);
  return div.innerHTML;
}

export function exportNote(
  kind: ExportKind,
  note: NoteNode,
  getHtml: () => string,
): Promise<void> | void {
  if (kind === "md") {
    download(`${safeName(note.title)}.md`, note.content, "text/markdown;charset=utf-8");
    return;
  }
  const bodyHtml = buildHtml(getHtml);
  if (kind === "html") {
    const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(note.title)}</title>
<style>
${collectStyles()}
body{background:#ffffff;color:#1b2430;padding:40px 24px;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.toastui-editor-contents{max-width:860px;margin:0 auto}
</style>
</head>
<body>
<div class="toastui-editor-contents">${bodyHtml}</div>
</body>
</html>`;
    download(`${safeName(note.title)}.html`, doc, "text/html;charset=utf-8");
    return;
  }
  // PNG：隐藏容器 + html2canvas
  return (async () => {
    const wrap = document.createElement("div");
    wrap.className = "toastui-editor-contents";
    wrap.style.cssText =
      "position:fixed;left:-9999px;top:0;width:860px;background:#ffffff;color:#1b2430;padding:48px;box-sizing:border-box;z-index:-1;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;";
    wrap.innerHTML = bodyHtml;
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
