/**
 * 行内解析（带源码偏移）。nomo 把行内标记建模为「源码区间 + 是否为标记」，
 * 这里做同样的事：每个 token 都记住自己在块原文里的相对偏移 `o` 与长度 `l`，
 * 于是渲染出来的每一段文字都能反查源码位置（点击定位、光标映射）。
 */
import { LruCache } from "../perf/lru";

export type InlineType =
  | "text"
  | "strong"
  | "em"
  | "del"
  | "code"
  | "link"
  | "image"
  | "math"
  | "br"
  | "html";

export interface InlineToken {
  t: InlineType;
  /** 纯文本内容（text/code/math/html） */
  text?: string;
  children?: InlineToken[];
  href?: string;
  title?: string;
  /** 相对块正文起点的偏移 */
  o: number;
  /** 源码长度（含标记本身） */
  l: number;
}

const cache = new LruCache<InlineToken[]>(
  1024,
  6 * 1024 * 1024,
  (key) => key.length * 4 + 96,
);

export function parseInline(src: string): InlineToken[] {
  const hit = cache.get(src);
  if (hit) return hit;
  const tokens = scan(src, 0, src.length);
  cache.set(src, tokens);
  return tokens;
}

function scan(src: string, from: number, to: number): InlineToken[] {
  const out: InlineToken[] = [];
  let i = from;

  const pushText = (text: string, o: number, l: number) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.t === "text" && last.o + last.l === o && !last.text?.endsWith("\n")) {
      last.text = (last.text ?? "") + text;
      last.l += l;
      return;
    }
    out.push({ t: "text", text, o, l });
  };

  while (i < to) {
    const ch = src[i];

    if (ch === "\\" && i + 1 < to) {
      pushText(src[i + 1], i, 2);
      i += 2;
      continue;
    }

    if (ch === "\n") {
      out.push({ t: "br", o: i, l: 1 });
      i += 1;
      continue;
    }

    if (ch === "`") {
      let run = 1;
      while (src[i + run] === "`") run += 1;
      const fence = "`".repeat(run);
      const close = src.indexOf(fence, i + run);
      if (close >= 0 && close < to) {
        const body = src.slice(i + run, close);
        out.push({ t: "code", text: body, o: i, l: close + run - i });
        i = close + run;
        continue;
      }
      pushText(fence, i, run);
      i += run;
      continue;
    }

    if (ch === "*" || ch === "_") {
      const double = src[i + 1] === ch;
      const mark = double ? ch + ch : ch;
      const close = findClose(src, i + mark.length, to, mark);
      if (close > i + mark.length) {
        const inner = scan(src, i + mark.length, close);
        out.push({
          t: double ? "strong" : "em",
          children: inner,
          o: i,
          l: close + mark.length - i,
        });
        i = close + mark.length;
        continue;
      }
      pushText(mark, i, mark.length);
      i += mark.length;
      continue;
    }

    if (ch === "~" && src[i + 1] === "~") {
      const close = findClose(src, i + 2, to, "~~");
      if (close > i + 2) {
        out.push({ t: "del", children: scan(src, i + 2, close), o: i, l: close + 2 - i });
        i = close + 2;
        continue;
      }
      pushText("~~", i, 2);
      i += 2;
      continue;
    }

    if (ch === "!" && src[i + 1] === "[") {
      const parsed = parseLinkTail(src, i + 1, to);
      if (parsed) {
        out.push({
          t: "image",
          text: parsed.text,
          href: parsed.href,
          title: parsed.title,
          o: i,
          l: parsed.end - i,
        });
        i = parsed.end;
        continue;
      }
    }

    if (ch === "[") {
      const parsed = parseLinkTail(src, i, to);
      if (parsed) {
        out.push({
          t: "link",
          children: scan(src, i + 1, parsed.textEnd),
          href: parsed.href,
          title: parsed.title,
          o: i,
          l: parsed.end - i,
        });
        i = parsed.end;
        continue;
      }
    }

    if (ch === "$" && src[i + 1] !== "$") {
      const close = src.indexOf("$", i + 1);
      if (close > i + 1 && close < to && !src.slice(i + 1, close).includes("\n")) {
        out.push({ t: "math", text: src.slice(i + 1, close), o: i, l: close + 1 - i });
        i = close + 1;
        continue;
      }
    }

    if (ch === "<") {
      const m = /^<(?:[/]?[a-zA-Z][^>]*|!--[\s\S]*?--)>/.exec(src.slice(i, Math.min(to, i + 200)));
      if (m) {
        out.push({ t: "html", text: m[0], o: i, l: m[0].length });
        i += m[0].length;
        continue;
      }
    }

    pushText(ch, i, 1);
    i += 1;
  }

  return out;
}

function findClose(src: string, from: number, to: number, mark: string): number {
  let idx = from;
  while (idx < to) {
    const found = src.indexOf(mark, idx);
    if (found < 0 || found >= to) return -1;
    if (src[found - 1] === "\\") {
      idx = found + mark.length;
      continue;
    }
    if (mark === "_" && /[0-9A-Za-z]/.test(src[found + 1] ?? "")) {
      idx = found + 1;
      continue;
    }
    return found;
  }
  return -1;
}

/** 解析 `[text](href "title")`，从 text 的 `[` 开始 */
function parseLinkTail(
  src: string,
  start: number,
  to: number,
): { text: string; textEnd: number; href: string; title: string; end: number } | null {
  if (src[start] !== "[") return null;
  let depth = 0;
  let textEnd = -1;
  for (let i = start; i < to; i++) {
    if (src[i] === "\\") {
      i += 1;
      continue;
    }
    if (src[i] === "[") depth += 1;
    else if (src[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        textEnd = i;
        break;
      }
    }
  }
  if (textEnd < 0 || src[textEnd + 1] !== "(") return null;
  let paren = 0;
  let end = -1;
  for (let i = textEnd + 1; i < to; i++) {
    if (src[i] === "(") paren += 1;
    else if (src[i] === ")") {
      paren -= 1;
      if (paren === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const target = src.slice(textEnd + 2, end).trim();
  const m = /^(<[^>]*>|\S*?)(?:\s+["']([^"']*)["'])?$/.exec(target);
  const href = (m?.[1] ?? target).replace(/^<|>$/g, "");
  return {
    text: src.slice(start + 1, textEnd),
    textEnd,
    href,
    title: m?.[2] ?? "",
    end: end + 1,
  };
}

/** 行内 token → 纯文本（大纲、复制、统计用） */
export function inlineText(tokens: InlineToken[]): string {
  let out = "";
  for (const tk of tokens) {
    if (tk.t === "text" || tk.t === "code" || tk.t === "math") out += tk.text ?? "";
    else if (tk.t === "image") out += tk.text ?? "";
    else if (tk.t === "html") continue;
    else if (tk.t === "br") out += "\n";
    else if (tk.children) out += inlineText(tk.children);
  }
  return out;
}