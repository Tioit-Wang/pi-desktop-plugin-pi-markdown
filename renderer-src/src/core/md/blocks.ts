/**
 * 块切分与块派生信息（nomo: markdown/blocks.rs + parse 阶段）。
 *
 * 关键约束：
 * - 切分与还原必须逐字节无损：Block.raw 只放本块文本，块间空白放在下一个
 *   块的 sep 里，尾部空白单独保存为 tail。
 * - parseBlock 是纯函数，结果进 LRU（按 raw 内容寻址），所以编辑一块只会让
 *   这一块的派生信息失效，其余块照旧复用。
 */
import { LruCache } from "../perf/lru";
import type {
  Block,
  BlockInfo,
  CodeInfo,
  ListInfo,
  QuoteInfo,
  TableInfo,
} from "./types";

let idSeq = 0;
export function newBlockId(): string {
  idSeq += 1;
  return "b" + idSeq.toString(36);
}

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+|$)/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`~\n]*)$/;
const HR = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const LIST = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const TASK = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)\[([ xX])\]([ \t]+|$)/;
const QUOTE = /^ {0,3}>[ ]?/;
const TABLE = /^ {0,3}\|/;
const MATH_FENCE = /^ {0,3}\$\$[ \t]*$/;
const HTML_START = /^ {0,3}<(?:!--|[a-zA-Z][a-zA-Z0-9-]*)/;
const FRONT_MATTER = /^---[ \t]*$/;
const IMAGE_ONLY =
  /^ {0,3}!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)[ \t]*$/;
const CALLOUT = /^\[!([A-Za-z]+)\][-+]?[ \t]*$/;

export interface SplitResult {
  blocks: Block[];
  /** 最后一个块之后的空白（通常是末尾换行） */
  tail: string;
}

export function normalizeNewlines(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** 一行是否开启一个新块（用于段落的中断判断） */
function startsBlock(line: string, atDocStart: boolean): boolean {
  if (!line.trim()) return true;
  if (FENCE.test(line) || MATH_FENCE.test(line)) return true;
  if (ATX.test(line) || HR.test(line)) return true;
  if (QUOTE.test(line) || TABLE.test(line)) return true;
  if (LIST.test(line)) return true;
  if (HTML_START.test(line)) return true;
  if (atDocStart && FRONT_MATTER.test(line)) return true;
  return false;
}

/** 返回该块的结束行号（含） */
function scanBlock(lines: string[], i: number): number {
  const n = lines.length;
  const line = lines[i];

  if (i === 0 && FRONT_MATTER.test(line)) {
    for (let j = 1; j < n; j++) {
      if (FRONT_MATTER.test(lines[j])) return j;
      if (FENCE.test(lines[j])) break;
    }
    return i;
  }

  const fence = FENCE.exec(line);
  if (fence) {
    const mark = fence[1][0];
    const len = fence[1].length;
    for (let j = i + 1; j < n; j++) {
      const close = new RegExp("^ {0,3}" + (mark === "`" ? "`" : "~") + "{" + len + ",}[ \\t]*$");
      if (close.test(lines[j])) return j;
    }
    return n - 1;
  }

  if (MATH_FENCE.test(line)) {
    for (let j = i + 1; j < n; j++) {
      if (MATH_FENCE.test(lines[j])) return j;
    }
    return n - 1;
  }

  if (/^ {0,3}<!--/.test(line)) {
    for (let j = i; j < n; j++) {
      if (lines[j].includes("-->")) return j;
    }
    return n - 1;
  }

  if (HR.test(line) && !SETEXT.test(line)) return i;

  if (ATX.test(line)) return i;

  // setext 标题：本文行 + 下一行下划线
  if (i + 1 < n && SETEXT.test(lines[i + 1]) && line.trim() && !LIST.test(line)) {
    return i + 1;
  }

  if (QUOTE.test(line)) {
    let j = i;
    while (j + 1 < n && QUOTE.test(lines[j + 1])) j++;
    return j;
  }

  if (TABLE.test(line)) {
    let j = i;
    while (j + 1 < n && TABLE.test(lines[j + 1])) j++;
    return j;
  }

  if (LIST.test(line)) {
    let j = i;
    while (j + 1 < n && /^[ \t]{2,}\S/.test(lines[j + 1])) j++;
    return j;
  }

  if (IMAGE_ONLY.test(line)) return i;

  if (HTML_START.test(line)) {
    let j = i;
    while (j + 1 < n && lines[j + 1].trim()) j++;
    return j;
  }

  let j = i;
  while (j + 1 < n && !startsBlock(lines[j + 1], false)) j++;
  return j;
}

export function splitDocument(source: string): SplitResult {
  const text = normalizeNewlines(source);
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  let prevEnd = -1;

  while (i < lines.length) {
    if (!lines[i].trim()) {
      i += 1;
      continue;
    }
    const end = scanBlock(lines, i);
    const sep =
      prevEnd < 0 ? "\n".repeat(i) : "\n".repeat(Math.max(1, i - prevEnd));
    blocks.push({
      id: newBlockId(),
      raw: lines.slice(i, end + 1).join("\n"),
      sep,
    });
    prevEnd = end;
    i = end + 1;
  }

  const lastLine = lines.length - 1;
  const tail = prevEnd < 0 ? text : "\n".repeat(Math.max(0, lastLine - prevEnd));
  return { blocks, tail };
}

export function joinDocument(blocks: Block[], tail = ""): string {
  let out = "";
  for (let i = 0; i < blocks.length; i++) {
    out += (i === 0 ? blocks[0].sep : blocks[i].sep) + blocks[i].raw;
  }
  return out + tail;
}

/* ---------- 块派生信息 ---------- */

const infoCache = new LruCache<BlockInfo>(
  2048,
  8 * 1024 * 1024,
  (key, value) => key.length * 4 + (value.text.length + 64) * 2,
);

export function parseBlock(raw: string): BlockInfo {
  const hit = infoCache.get(raw);
  if (hit) return hit;
  const info = deriveBlockInfo(raw);
  infoCache.set(raw, info);
  return info;
}

function deriveBlockInfo(raw: string): BlockInfo {
  const base: BlockInfo = { kind: "paragraph", text: raw, bodyOffset: 0, chars: raw.length };
  if (!raw.trim()) return { ...base, kind: "empty", text: "", chars: 0 };

  const lines = raw.split("\n");

  if (lines.length >= 2 && FRONT_MATTER.test(lines[0])) {
    const close = lines.findIndex((l, idx) => idx > 0 && FRONT_MATTER.test(l));
    if (close > 0) {
      const pairs: { key: string; value: string }[] = [];
      for (const line of lines.slice(1, close)) {
        const m = /^([^:\s]+)\s*:\s*(.*)$/.exec(line);
        if (m) pairs.push({ key: m[1], value: m[2] });
      }
      return { ...base, kind: "frontmatter", text: "", bodyOffset: 0, chars: 0, frontmatter: pairs };
    }
  }

  const fence = FENCE.exec(lines[0]);
  if (fence) {
    const mark = fence[1][0];
    const len = fence[1].length;
    let end = lines.length;
    const closeRe = new RegExp("^ {0,3}" + (mark === "`" ? "`" : "~") + "{" + len + ",}[ \\t]*$");
    for (let j = 1; j < lines.length; j++) {
      if (closeRe.test(lines[j])) {
        end = j;
        break;
      }
    }
    const body = lines.slice(1, end).join("\n");
    const lang = fence[2].trim().split(/\s+/)[0] ?? "";
    const code: CodeInfo = {
      lang: lang.toLowerCase(),
      body,
      bodyOffset: lines[0].length + 1,
      fence: fence[1],
    };
    return {
      ...base,
      kind: "code",
      text: body,
      bodyOffset: code.bodyOffset,
      chars: raw.length,
      code,
    };
  }

  if (MATH_FENCE.test(lines[0])) {
    let end = lines.length;
    for (let j = 1; j < lines.length; j++) {
      if (MATH_FENCE.test(lines[j])) {
        end = j;
        break;
      }
    }
    const bodyOffset = lines[0].length + 1;
    const body = lines.slice(1, end).join("\n");
    return { ...base, kind: "math", text: body, bodyOffset, chars: body.length };
  }

  const hrCandidate = HR.test(lines[0]) && !SETEXT.test(lines[0]);
  if (hrCandidate) return { ...base, kind: "hr", text: "", chars: 0 };

  const atx = ATX.exec(raw);
  if (atx) {
    const level = atx[1].length;
    const prefixLen = atx[0].length;
    const text = raw
      .slice(prefixLen)
      .replace(/[ \t]+#+[ \t]*$/, "")
      .replace(/\n+$/, "");
    return { ...base, kind: "heading", level, text, bodyOffset: prefixLen, chars: text.length };
  }

  if (lines.length === 2 && SETEXT.test(lines[1])) {
    const level = lines[1].trim().startsWith("=") ? 1 : 2;
    const text = lines[0].trim();
    return { ...base, kind: "heading", level, text, bodyOffset: 0, chars: text.length };
  }

  if (QUOTE.test(lines[0])) {
    let bodyOffset = QUOTE.exec(lines[0])![0].length;
    const stripped = lines.map((l) => {
      const m = QUOTE.exec(l);
      return m ? l.slice(m[0].length) : l;
    });
    let callout: string | null = null;
    const first = stripped[0] ?? "";
    const typeMatch = CALLOUT.exec(first);
    if (typeMatch) {
      callout = typeMatch[1].toLowerCase();
      stripped.shift();
      bodyOffset += first.length;
      if (stripped.length) bodyOffset += 1;
    }
    const body = stripped.join("\n");
    const quote: QuoteInfo = { body, bodyOffset, callout };
    return {
      ...base,
      kind: callout ? "callout" : "quote",
      text: body,
      bodyOffset,
      chars: body.length,
      quote,
    };
  }

  if (TABLE.test(lines[0])) {
    const grid: { text: string; offset: number }[][] = [];
    const align: ("left" | "center" | "right" | null)[] = [];
    let offset = 0;
    let hasHeader = false;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const lineStart = offset;
      let pos = 0;
      const rawCells: { text: string; offset: number }[] = [];
      const inner = line.replace(/^ {0,3}\|/, "");
      pos = line.length - inner.length;
      const parts = splitCells(inner);
      for (const part of parts.cells) {
        rawCells.push({ text: part.text.trim(), offset: lineStart + pos + part.start });
      }
      if (li === 0) {
        for (const c of rawCells) {
          if (/^:?-{2,}:?$/.test(c.text)) hasHeader = true;
          align.push(
            /^:-+:$/.test(c.text) ? "center" : /^-+:$/.test(c.text) ? "right" : "left",
          );
        }
      }
      if (!rawCells.every((c) => /^:?-{2,}:?$/.test(c.text))) grid.push(rawCells);
      offset += line.length + 1;
    }
    const table: TableInfo = { rows: grid, align, header: hasHeader };
    return {
      ...base,
      kind: "table",
      text: grid.map((r) => r.map((c) => c.text).join(" ")).join("\n"),
      bodyOffset: 0,
      chars: raw.length,
      table,
    };
  }

  const task = TASK.exec(lines[0]);
  if (task) {
    const indent = task[1].length;
    const marker = task[2];
    const list: ListInfo = {
      ordered: /\d/.test(marker),
      indent,
      marker,
      number: parseInt(marker, 10) || 1,
      contentOffset: task[0].length,
      checked: task[4].toLowerCase() === "x",
    };
    const text = lines[0].slice(task[0].length).trim();
    return { ...base, kind: "task", text, bodyOffset: list.contentOffset, chars: raw.length, list };
  }

  const item = LIST.exec(lines[0]);
  if (item) {
    const indent = item[1].length;
    const marker = item[2];
    const list: ListInfo = {
      ordered: /\d/.test(marker),
      indent,
      marker,
      number: parseInt(marker, 10) || 1,
      contentOffset: item[0].length,
      checked: null,
    };
    const text = lines[0].slice(item[0].length).trim();
    return { ...base, kind: "list", text, bodyOffset: list.contentOffset, chars: raw.length, list };
  }

  const image = IMAGE_ONLY.exec(raw);
  if (image) {
    return {
      ...base,
      kind: "image",
      text: image[1],
      bodyOffset: 0,
      chars: 0,
      image: { src: image[2], alt: image[1], title: image[3] ?? "", offset: 0 },
    };
  }

  if (HTML_START.test(lines[0])) {
    return { ...base, kind: "html", text: raw, bodyOffset: 0, chars: raw.length };
  }

  return base;
}

/** 表格行按未转义的 | 切分，保留每格在行内的偏移 */
function splitCells(line: string): { cells: { text: string; start: number }[] } {
  const cells: { text: string; start: number }[] = [];
  let start = 0;
  let buf = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      buf += ch + line[i + 1];
      i += 1;
      continue;
    }
    if (ch === "|") {
      cells.push({ text: buf, start });
      buf = "";
      start = i + 1;
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) cells.push({ text: buf, start });
  return { cells };
}

/** 估算块高度（虚拟滚动占位；测量后会被实测值替换） */
export function estimateHeight(info: BlockInfo, contentWidth: number): number {
  const width = Math.max(240, contentWidth);
  const charPx = 9;
  const perLine = Math.max(8, Math.floor(width / charPx));
  switch (info.kind) {
    case "heading": {
      const size = headingSize(info.level ?? 1);
      const lines = Math.max(1, Math.ceil((info.text.length || 1) / perLine));
      return lines * size * 1.35 + 24;
    }
    case "code": {
      const lines = info.code ? info.code.body.split("\n").length : 1;
      const cap = Math.min(lines, 24);
      return 40 + cap * 22 + 12;
    }
    case "math":
      return 84;
    case "table": {
      const rows = info.table?.rows.length ?? 1;
      return rows * 40 + 12;
    }
    case "image":
      return 260;
    case "hr":
      return 28;
    case "frontmatter":
      return (info.frontmatter?.length ?? 1) * 28 + 28;
    case "empty":
      return 32;
    case "list":
    case "task":
      return Math.max(1, Math.ceil((info.text.length || 1) / (perLine - 2))) * 28 + 6;
    case "quote":
    case "callout":
      return Math.max(1, Math.ceil((info.text.length || 1) / (perLine - 3))) * 28 + (info.kind === "callout" ? 30 : 16);
    default:
      return Math.max(1, Math.ceil((info.text.length || 1) / perLine)) * 28 + 16;
  }
}

export function headingSize(level: number): number {
  switch (level) {
    case 1:
      return 32;
    case 2:
      return 26;
    case 3:
      return 21;
    case 4:
      return 18;
    case 5:
      return 16;
    default:
      return 14.5;
  }
}