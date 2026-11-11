/**
 * 导出（Markdown / HTML / PNG）。
 * HTML 与 PNG 都走「块 → HTML」同一条序列化路径，因此与屏幕排版一致；
 * PNG 在离屏容器里完整排版后交给 html2canvas，避免受虚拟滚动窗口影响。
 */
import html2canvas from "html2canvas";
import type { ExportKind } from "../types";
import type { Block } from "../core/md/types";
import { blocksToBodyHtml, EXPORT_CSS } from "../core/export/html";

function download(name: string, data: BlobPart, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFileName(title: string): string {
  const cleaned = (title || "untitled")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 80) || "untitled";
}

export async function exportNote(
  kind: ExportKind,
  title: string,
  blocks: Block[],
): Promise<void> {
  const name = safeFileName(title);

  if (kind === "md") {
    download(name + ".md", blocks.map((b) => b.sep + b.raw).join(""), "text/markdown;charset=utf-8");
    return;
  }

  const body = await blocksToBodyHtml(blocks);

  if (kind === "html") {
    const html = [
      "<!doctype html>",
      '<html lang="zh-CN"><head><meta charset="utf-8">',
      "<title>" + escapeText(title) + "</title>",
      "<style>" + EXPORT_CSS + "</style>",
      "</head><body><div class=\"doc\">" + body + "</div></body></html>",
    ].join("\n");
    download(name + ".html", html, "text/html;charset=utf-8");
    return;
  }

  // PNG：离屏完整排版 → 截图
  const host = document.createElement("div");
  host.setAttribute("data-pi-md-export", "1");
  host.style.cssText =
    "position:fixed;left:-20000px;top:0;width:820px;background:#fff;padding:0;z-index:-1";
  const style = document.createElement("style");
  style.textContent = EXPORT_CSS;
  const doc = document.createElement("div");
  doc.className = "doc";
  doc.innerHTML = body;
  host.appendChild(style);
  host.appendChild(doc);
  document.body.appendChild(host);
  try {
    const canvas = await html2canvas(doc, {
      backgroundColor: "#ffffff",
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      width: 820,
      windowWidth: 820,
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("canvas toBlob failed");
    download(name + ".png", blob, "image/png");
  } finally {
    host.remove();
  }
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}