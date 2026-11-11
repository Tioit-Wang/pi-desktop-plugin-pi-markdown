/**
 * 导出用 HTML 序列化（nomo: document_export/html.rs 的极简版）。
 * 与编辑器共用同一套块/行内解析，因此导出结果与屏幕所见一致；
 * 数学走 KaTeX HTML，代码走同一份高亮缓存。
 */
import { mathHtml } from "../md/katex";
import { highlight } from "../perf/highlight";
import { loadMermaid } from "../perf/mermaid-loader";
import { parseBlock } from "../md/blocks";
import { parseInline, type InlineToken } from "../md/inline";
import type { Block } from "../md/types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineHtml(tokens: InlineToken[]): string {
  let out = "";
  for (const token of tokens) {
    switch (token.t) {
      case "text":
        out += escapeHtml(token.text ?? "");
        break;
      case "strong":
        out += "<strong>" + inlineHtml(token.children ?? []) + "</strong>";
        break;
      case "em":
        out += "<em>" + inlineHtml(token.children ?? []) + "</em>";
        break;
      case "del":
        out += "<del>" + inlineHtml(token.children ?? []) + "</del>";
        break;
      case "code":
        out += "<code>" + escapeHtml(token.text ?? "") + "</code>";
        break;
      case "math":
        out += katexHtml(token.text ?? "", false);
        break;
      case "link":
        out +=
          '<a href="' +
          escapeHtml(token.href ?? "") +
          '">' +
          inlineHtml(token.children ?? []) +
          "</a>";
        break;
      case "image":
        out +=
          '<img src="' + escapeHtml(token.href ?? "") + '" alt="' + escapeHtml(token.text ?? "") + '">';
        break;
      case "br":
        out += "<br>";
        break;
      case "html":
        out += escapeHtml(token.text ?? "");
        break;
      default:
        break;
    }
  }
  return out;
}

function katexHtml(tex: string, display: boolean): string {
  try {
    return mathHtml(tex, display);
  } catch {
    return "<code>" + escapeHtml(tex) + "</code>";
  }
}

export async function blocksToBodyHtml(
  blocks: Block[],
  mathmlOnly = false,
): Promise<string> {
  const parts: string[] = [];
  for (const block of blocks) {
    const info = parseBlock(block.raw);
    switch (info.kind) {
      case "heading": {
        const level = Math.min(6, Math.max(1, info.level ?? 1));
        parts.push("<h" + level + ">" + inlineHtml(parseInline(info.text)) + "</h" + level + ">");
        break;
      }
      case "list":
        parts.push(
          "<div class=\"li\" style=\"padding-left:" +
            (info.list?.indent ?? 0) * 12 +
            'px"><span class="li-mark">' +
            (info.list?.ordered ? (info.list?.number ?? 1) + "." : "\u2022") +
            "</span><span>" +
            inlineHtml(parseInline(info.text)) +
            "</span></div>",
        );
        break;
      case "task":
        parts.push(
          "<div class=\"li task\"><span class=\"task-box" +
            (info.list?.checked ? " checked" : "") +
            '"></span><span>' +
            inlineHtml(parseInline(info.text)) +
            "</span></div>",
        );
        break;
      case "quote":
        parts.push("<blockquote>" + inlineHtml(parseInline(info.quote?.body ?? info.text)) + "</blockquote>");
        break;
      case "callout":
        parts.push(
          '<div class="callout callout-' +
            (info.quote?.callout ?? "note") +
            '"><div class="callout-title">' +
            escapeHtml((info.quote?.callout ?? "note").toUpperCase()) +
            "</div><div>" +
            inlineHtml(parseInline(info.quote?.body ?? "")) +
            "</div></div>",
        );
        break;
      case "code": {
        const code = info.code!;
        if (code.lang === "mermaid") {
          parts.push(await mermaidSvg(code.body));
          break;
        }
        const highlighted = highlight(code.body, code.lang);
        parts.push(
          '<pre class="code"><code class="language-' +
            escapeHtml(code.lang) +
            '">' +
            (highlighted ?? escapeHtml(code.body)) +
            "</code></pre>",
        );
        break;
      }
      case "math":
        parts.push('<div class="math-block">' + katexHtml(info.text, !mathmlOnly) + "</div>");
        break;
      case "table": {
        const table = info.table!;
        const rows = table.rows
          .map((row, ri) => {
            const tag = table.header && ri === 0 ? "th" : "td";
            return (
              "<tr>" +
              row
                .map((cell, ci) => {
                  const align = table.align[ci];
                  return (
                    "<" +
                    tag +
                    (align ? ' style="text-align:' + align + '"' : "") +
                    ">" +
                    inlineHtml(parseInline(cell.text)) +
                    "</" +
                    tag +
                    ">"
                  );
                })
                .join("") +
              "</tr>"
            );
          })
          .join("");
        parts.push("<table>" + rows + "</table>");
        break;
      }
      case "hr":
        parts.push("<hr>");
        break;
      case "image":
        parts.push(
          '<figure><img src="' +
            escapeHtml(info.image!.src) +
            '" alt="' +
            escapeHtml(info.image!.alt) +
            '"><figcaption>' +
            escapeHtml(info.image!.alt) +
            "</figcaption></figure>",
        );
        break;
      case "frontmatter":
        parts.push(
          '<div class="front-matter">' +
            (info.frontmatter ?? [])
              .map((pair) => "<div><b>" + escapeHtml(pair.key) + "</b><span>" + escapeHtml(pair.value) + "</span></div>")
              .join("") +
            "</div>",
        );
        break;
      case "html":
        parts.push('<pre class="code"><code>' + escapeHtml(block.raw) + "</code></pre>");
        break;
      default:
        parts.push("<p>" + inlineHtml(parseInline(block.raw)) + "</p>");
    }
  }
  return parts.join("\n");
}

async function mermaidSvg(code: string): Promise<string> {
  try {
    const api = await loadMermaid();
    const svg = await api.renderChart(code, "default");
    return '<div class="mermaid">' + svg + "</div>";
  } catch {
    return '<pre class="code"><code>' + escapeHtml(code) + "</code></pre>";
  }
}

export const EXPORT_CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:48px 24px;background:#fff;color:#202428;
  font:16px/1.75 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.doc{max-width:760px;margin:0 auto}
h1,h2,h3,h4,h5,h6{color:#171a1f;line-height:1.35;margin:1.5em 0 .6em;font-weight:700}
h1{font-size:32px;margin-top:0}h2{font-size:26px}h3{font-size:21px}
h4{font-size:18px}h5{font-size:16px}h6{font-size:14.5px}
p{margin:0 0 16px}
a{color:#116d8f;text-decoration:none;border-bottom:1px solid rgba(17,109,143,.28)}
code{font-family:"Cascadia Code","JetBrains Mono",Consolas,monospace;font-size:.9em}
p code,li code,td code{background:#eef4f2;color:#174e45;padding:.1em .35em;border-radius:4px}
pre.code{background:#f5f6f8;border:1px solid #e0e2e6;border-radius:8px;padding:14px 16px;
  overflow:auto;font-size:13px;line-height:1.6}
pre.code .token.keyword{color:#d73a49}
pre.code .token.string{color:#032f62}
pre.code .token.number,.token.boolean{color:#005cc5}
pre.code .token.comment{color:#6a737d;font-style:italic}
pre.code .token.function{color:#6f42c1}
pre.code .token.class-name,.token.builtin{color:#6f42c1}
pre.code .token.operator,.token.punctuation{color:#24292e}
pre.code .token.tag{color:#22863a}
blockquote{margin:0 0 16px;padding:2px 0 2px 14px;border-left:3px solid #7f9f97;color:#465753}
.callout{border:1px solid #dfe3e8;border-left:3px solid #3b82f6;border-radius:8px;padding:10px 14px;margin:0 0 16px;background:#f8fafc}
.callout-title{font-weight:700;font-size:13px;letter-spacing:.04em;margin-bottom:4px;color:#1e40af}
.callout-tip{border-left-color:#22c55e}.callout-tip .callout-title{color:#166534}
.callout-warning{border-left-color:#f59e0b}.callout-warning .callout-title{color:#92400e}
.callout-important{border-left-color:#a855f7}.callout-important .callout-title{color:#6b21a8}
.callout-caution{border-left-color:#ef4444}.callout-caution .callout-title{color:#991b1b}
.li{display:flex;gap:8px;margin:0 0 6px}
.li-mark{color:#68707a;min-width:1.2em}
.task-box{width:14px;height:14px;border:1.5px solid #b6bfc7;border-radius:4px;display:inline-block;margin-top:6px}
.task-box.checked{background:#2f7d6f;border-color:#2f7d6f}
table{border-collapse:separate;border-spacing:0;width:100%;margin:0 0 16px;border:1px solid #dfe3e8;border-radius:6px;overflow:hidden;font-size:14px}
th,td{padding:9px 11px;border-bottom:1px solid #dfe3e8;text-align:left}
th{background:#f0f2f4;font-weight:700;font-size:13px}
tr:last-child td{border-bottom:none}
hr{border:none;border-top:1px solid #dfe3e8;margin:24px 0}
figure{margin:16px 0;text-align:center}
figure img{max-width:100%;border-radius:6px}
figcaption{color:#68707a;font-size:13px;margin-top:6px}
.math-block{text-align:center;margin:16px 0}
.front-matter{border:1px solid #dfe3e8;border-radius:8px;padding:10px 14px;margin:0 0 16px;font-size:14px;background:#fafbfc}
.front-matter>div{display:flex;gap:12px;padding:2px 0}
.front-matter b{color:#68707a;font-weight:600;min-width:88px}
.mermaid{text-align:center;margin:16px 0}
`;