/**
 * 编辑操作（nomo: nomo_mark/commands.rs 的 Web 版）。
 *
 * 约定：所有函数都拿到 (session, 块序号, 块内偏移)，返回操作后的新选区，
 * 由编辑器负责把选区写回 DOM。函数本身不做任何 DOM 操作，方便测试与复用。
 */
import { newBlockId, parseBlock } from "../md/blocks";
import type { Block } from "../md/types";
import type { DocSession, Sel } from "./session";

export function sel(index: number, session: DocSession, start: number, end = start): Sel {
  return { blockId: session.blocks[index]?.id ?? "", start, end };
}

/* ---------- 基础：块内替换 ---------- */

export function replaceInBlock(
  session: DocSession,
  index: number,
  start: number,
  end: number,
  text: string,
  opts: { silent?: boolean } = {},
): Sel {
  const block = session.blocks[index];
  if (!block) return { blockId: "", start: 0, end: 0 };
  const raw = block.raw.slice(0, start) + text + block.raw.slice(end);
  const caret = start + text.length;
  session.setRaw(index, raw, { silent: opts.silent, sel: sel(index, session, caret) });
  return sel(index, session, caret);
}

/* ---------- Enter：拆块 ---------- */

const NON_SPLIT: string[] = ["code", "math", "frontmatter", "table", "html"];

export function splitBlock(session: DocSession, index: number, offset: number): Sel {
  const block = session.blocks[index];
  if (!block) return { blockId: "", start: 0, end: 0 };
  const info = parseBlock(block.raw);

  if (NON_SPLIT.indexOf(info.kind) >= 0) {
    return replaceInBlock(session, index, offset, offset, "\n");
  }

  const head = block.raw.slice(0, offset);
  const tailText = block.raw.slice(offset);
  let prefix = "";
  let sep = "\n\n";

  if (info.kind === "list" || info.kind === "task") {
    const list = info.list!;
    const indent = " ".repeat(list.indent);
    if (list.checked !== null) {
      prefix = indent + "- [ ] ";
    } else if (list.ordered) {
      prefix = indent + String(list.number + 1) + ". ";
    } else {
      prefix = indent + list.marker + " ";
    }
    sep = "\n";
  } else if (info.kind === "quote" || info.kind === "callout") {
    prefix = "> ";
    if (info.kind === "callout") prefix = "> ";
    sep = "\n";
  } else if (info.kind === "heading") {
    prefix = "";
    sep = "\n\n";
  }

  // 空列表项：回车退出列表（变成普通段落）
  if ((info.kind === "list" || info.kind === "task") && !info.text.trim() && !tailText.trim()) {
    session.setRaw(index, "", { sel: sel(index, session, 0) });
    return sel(index, session, 0);
  }

  const inserted: Block[] = [
    { id: block.id, raw: head, sep: block.sep },
    { id: newBlockId(), raw: prefix + tailText, sep },
  ];
  session.splice(index, 1, inserted, { coalesceKey: null });
  return sel(index + 1, session, prefix.length);
}

/* ---------- Backspace：并块 / 去标记 ---------- */

export function mergeBackward(session: DocSession, index: number): Sel {
  const block = session.blocks[index];
  if (!block) return { blockId: "", start: 0, end: 0 };
  const info = parseBlock(block.raw);

  if (NON_SPLIT.indexOf(info.kind) >= 0 || info.kind === "hr" || info.kind === "image") {
    if (!block.raw) {
      return deleteBlock(session, index);
    }
    return sel(index, session, 0);
  }

  // 列表/任务项：先退掉标记（保持内容），再退层级，最后才并块
  if ((info.kind === "list" || info.kind === "task") && info.list) {
    const list = info.list;
    if (list.indent > 0) {
      const raw = " ".repeat(Math.max(0, list.indent - 2)) + block.raw.slice(list.indent);
      session.setRaw(index, raw);
      return sel(index, session, Math.max(0, list.indent - 2));
    }
    const raw = block.raw.slice(list.contentOffset);
    if (raw.trim()) {
      session.setRaw(index, raw);
      return sel(index, session, 0);
    }
    return deleteBlock(session, index);
  }

  if (!block.raw) return deleteBlock(session, index);

  const prevIndex = index - 1;
  if (prevIndex < 0) return sel(index, session, 0);
  const prev = session.blocks[prevIndex];
  const prevInfo = parseBlock(prev.raw);

  if (NON_SPLIT.indexOf(prevInfo.kind) >= 0) {
    return sel(prevIndex, session, prev.raw.length);
  }

  const merged: Block = { id: prev.id, raw: prev.raw + block.raw, sep: prev.sep };
  session.splice(prevIndex, 2, [merged], { coalesceKey: null });
  return sel(prevIndex, session, prev.raw.length);
}

export function deleteBlock(session: DocSession, index: number): Sel {
  if (session.blocks.length <= 1) {
    session.setRaw(index, "");
    return sel(index, session, 0);
  }
  const target = Math.max(0, index - 1);
  session.splice(index, 1, [], { coalesceKey: null });
  const nextIndex = Math.min(target, session.blocks.length - 1);
  return sel(nextIndex, session, session.blocks[nextIndex]?.raw.length ?? 0);
}

/* ---------- 列表缩进 / 任务勾选 ---------- */

export function indentBlock(session: DocSession, index: number, delta: 2 | -2): Sel {
  const block = session.blocks[index];
  if (!block) return { blockId: "", start: 0, end: 0 };
  const info = parseBlock(block.raw);
  if (info.kind === "list" || info.kind === "task") {
    const indent = info.list?.indent ?? 0;
    const next = Math.max(0, indent + delta);
    const raw = " ".repeat(next) + block.raw.slice(indent);
    session.setRaw(index, raw);
    return sel(index, session, Math.max(0, next));
  }
  if (delta > 0) return replaceInBlock(session, index, 0, 0, "  ");
  return sel(index, session, 0);
}

export function toggleTaskAt(session: DocSession, index: number): void {
  const block = session.blocks[index];
  if (!block) return;
  const info = parseBlock(block.raw);
  if (info.kind === "task" && info.list) {
    const offset = block.raw.indexOf(info.list.checked ? "[x]" : "[ ]");
    const alt = block.raw.indexOf(info.list.checked ? "[X]" : "[ ]");
    const at = offset >= 0 ? offset : alt;
    if (at < 0) return;
    const current = block.raw.slice(at, at + 3);
    const next = /\[[xX]\]/.test(current) ? "[ ]" : "[x]";
    session.setRaw(index, block.raw.slice(0, at) + next + block.raw.slice(at + 3));
    return;
  }
  if (info.kind === "list") {
    const at = info.list?.contentOffset ?? 0;
    const raw = block.raw.slice(0, at) + "[ ] " + block.raw.slice(at);
    session.setRaw(index, raw.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[ \]\s*\[ \]\s*/, "$1[ ] "));
  }
}

/* ---------- 行内标记 ---------- */

export function toggleInline(
  session: DocSession,
  index: number,
  start: number,
  end: number,
  marker: string,
): Sel {
  const block = session.blocks[index];
  if (!block) return { blockId: "", start: 0, end: 0 };
  const raw = block.raw;
  const before = raw.slice(Math.max(0, start - marker.length), start);
  const after = raw.slice(end, end + marker.length);

  if (before === marker && after === marker) {
    const next = raw.slice(0, start - marker.length) + raw.slice(start, end) + raw.slice(end + marker.length);
    session.setRaw(index, next);
    return sel(index, session, start - marker.length, end - marker.length);
  }

  const inner = raw.slice(start, end);
  const next = raw.slice(0, start) + marker + inner + marker + raw.slice(end);
  session.setRaw(index, next);
  return inner
    ? sel(index, session, start + marker.length, end + marker.length)
    : sel(index, session, start + marker.length);
}

/* ---------- 块类型转换 ---------- */

export type TargetKind =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "list"
  | "task"
  | "ordered"
  | "quote"
  | "callout"
  | "code"
  | "math"
  | "mermaid"
  | "table"
  | "hr";

function stripPrefix(raw: string): { text: string; indent: number } {
  const info = parseBlock(raw);
  if (info.kind === "heading" || info.kind === "quote" || info.kind === "callout") {
    return { text: info.text, indent: 0 };
  }
  if ((info.kind === "list" || info.kind === "task") && info.list) {
    return { text: info.text, indent: info.list.indent };
  }
  return { text: raw, indent: 0 };
}

export function convertBlock(session: DocSession, index: number, target: TargetKind): Sel {
  const block = session.blocks[index];
  if (!block) return { blockId: "", start: 0, end: 0 };
  const info = parseBlock(block.raw);
  const { text, indent } = stripPrefix(block.raw);
  const pad = " ".repeat(indent);
  let raw = block.raw;

  switch (target) {
    case "paragraph":
      raw = info.kind === "code" ? (info.code?.body ?? text) : text;
      break;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      raw = "#".repeat(Number(target[1])) + " " + (text || "");
      break;
    case "list":
      raw = pad + "- " + text;
      break;
    case "ordered":
      raw = pad + "1. " + text;
      break;
    case "task":
      raw = pad + "- [ ] " + text;
      break;
    case "quote":
      raw = "> " + text;
      break;
    case "callout":
      raw = "> [!NOTE]\n> " + text;
      break;
    case "code":
      raw = info.kind === "code" ? block.raw : "```\n" + block.raw + "\n```";
      break;
    case "mermaid":
      raw = "```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```";
      break;
    case "math":
      raw = info.kind === "math" ? block.raw : "$$\n" + text + "\n$$";
      break;
    case "table":
      raw = "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |";
      break;
    case "hr":
      raw = "---";
      break;
  }

  session.setRaw(index, raw, { coalesceKey: null });
  const bodyOffset = parseBlock(raw).bodyOffset;
  return sel(index, session, Math.min(bodyOffset, raw.length));
}

/** 改代码块语言（重写围栏首行） */
export function setCodeLanguage(session: DocSession, index: number, lang: string): void {
  const block = session.blocks[index];
  if (!block) return;
  const info = parseBlock(block.raw);
  if (info.kind !== "code" || !info.code) return;
  const lines = block.raw.split("\n");
  lines[0] = info.code.fence + lang;
  session.setRaw(index, lines.join("\n"), { coalesceKey: null });
}

/* ---------- 插入 ---------- */

export function insertBlockAfter(session: DocSession, index: number, raw: string): Sel {
  const target = index + 1;
  const sep = '\n\n';
  session.splice(target, 0, [{ id: newBlockId(), raw, sep }], { coalesceKey: null });
  return sel(target, session, raw.length);
}

/* ---------- 父级遍历（Tab 缩进判定用） ---------- */

export function isListLike(session: DocSession, index: number): boolean {
  const info = session.info(index);
  return info.kind === "list" || info.kind === "task";
}