/**
 * 文档会话（nomo: text_document / markdown_session 的 Web 版）。
 *
 * - 一份文档 = 有序块 + 尾部空白，`source` 永远由块拼回，保证无损。
 * - 所有改动都走 `splice()`：记账一笔可逆补丁，撤销/重做只回放补丁，
 *   不保存全文快照（避免大文档历史膨胀）。
 * - 订阅分两级：`edit`（正文变化）与 `structure`（块数量变化，需要重排窗口）。
 */
import { joinDocument, newBlockId, normalizeNewlines, parseBlock, splitDocument } from "../md/blocks";
import type { Block, BlockInfo, HeadingEntry } from "../md/types";

export interface Sel {
  blockId: string;
  start: number;
  end: number;
}

interface Patch {
  from: number;
  removed: Block[];
  inserted: Block[];
  tailBefore: string;
  tailAfter: string;
  selBefore: Sel | null;
  selAfter: Sel | null;
  coalesceKey: string | null;
  at: number;
}

export interface Stats {
  chars: number;
  words: number;
  lines: number;
  blocks: number;
  readingMinutes: number;
}

const COALESCE_MS = 800;

export class DocSession {
  blocks: Block[];
  tail: string;
  rev = 1;
  savedRev = 0;
  eol: "\n" | "\r\n" = "\n";
  readonly id: string;

  private undoStack: Patch[] = [];
  private redoStack: Patch[] = [];
  private listeners = new Set<(kind: "edit" | "structure") => void>();
  private headingIndex = new Map<string, { rev: number; level: number; text: string }>();
  private statsCache: { rev: number; value: Stats } | null = null;

  constructor(id: string, source: string) {
    this.id = id;
    this.eol = /\r\n/.test(source) ? "\r\n" : "\n";
    const split = splitDocument(source);
    this.blocks = split.blocks.length
      ? split.blocks
      : [{ id: newBlockId(), raw: "", sep: "" }];
    this.tail = split.blocks.length ? split.tail : "";
  }

  get source(): string {
    const text = joinDocument(this.blocks, this.tail);
    return this.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
  }

  get editableSource(): string {
    return joinDocument(this.blocks, this.tail);
  }

  get dirty(): boolean {
    return this.rev !== this.savedRev;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  info(index: number): BlockInfo {
    const block = this.blocks[index];
    return block ? parseBlock(block.raw) : parseBlock("");
  }

  indexOf(blockId: string): number {
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i].id === blockId) return i;
    }
    return -1;
  }

  subscribe(fn: (kind: "edit" | "structure") => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(kind: "edit" | "structure"): void {
    for (const fn of this.listeners) fn(kind);
  }

  markSaved(): void {
    this.savedRev = this.rev;
  }

  /* ---------- 变更 ---------- */

  /**
   * 用若干块替换 [from, from+removeCount) 区间。
   * 非首块的 sep 会被校正为至少一个换行，避免块粘连。
   */
  splice(
    from: number,
    removeCount: number,
    inserted: Block[],
    opts: {
      selBefore?: Sel | null;
      selAfter?: Sel | null;
      coalesceKey?: string | null;
      tail?: string;
      silent?: boolean;
    } = {},
  ): void {
    const before = this.blocks.slice(from, from + removeCount);
    const patch: Patch = {
      from,
      removed: before,
      inserted: inserted.map((b) => ({ ...b })),
      tailBefore: this.tail,
      tailAfter: opts.tail ?? this.tail,
      selBefore: opts.selBefore ?? null,
      selAfter: opts.selAfter ?? null,
      coalesceKey: opts.coalesceKey ?? null,
      at: Date.now(),
    };

    const next = this.blocks.slice();
    next.splice(from, removeCount, ...patch.inserted.map((b) => ({ ...b })));
    for (let i = Math.max(1, from); i < next.length; i++) {
      const sep = next[i].sep;
      if (!sep || sep.indexOf("\n") < 0) next[i] = { ...next[i], sep: "\n" };
    }
    this.blocks = next;
    this.tail = patch.tailAfter;
    this.rev += 1;

    const top = this.undoStack[this.undoStack.length - 1];
    const mergeable = !!(
      top &&
      patch.coalesceKey &&
      top.coalesceKey === patch.coalesceKey &&
      patch.at - top.at < COALESCE_MS &&
      top.from === patch.from &&
      top.removed.length === patch.inserted.length &&
      top.inserted.length === patch.inserted.length
    );
    if (mergeable) {
      top.inserted = patch.inserted;
      top.tailAfter = patch.tailAfter;
      top.selAfter = patch.selAfter;
      top.at = patch.at;
    } else {
      this.undoStack.push(patch);
      if (this.undoStack.length > 400) this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.statsCache = null;

    if (!opts.silent) {
      this.emit(inserted.length === removeCount ? "edit" : "structure");
    }
  }

  /** 单块正文替换（输入热路径） */
  setRaw(
    index: number,
    raw: string,
    opts: { silent?: boolean; sel?: Sel | null; coalesceKey?: string | null } = {},
  ): void {
    const block = this.blocks[index];
    if (!block || block.raw === raw) return;
    this.splice(index, 1, [{ id: block.id, raw, sep: block.sep }], {
      coalesceKey: opts.coalesceKey === undefined ? block.id : opts.coalesceKey,
      selAfter: opts.sel ?? null,
      silent: opts.silent,
    });
  }

  replaceAll(source: string): void {
    const split = splitDocument(source);
    this.blocks = split.blocks.length
      ? split.blocks
      : [{ id: newBlockId(), raw: "", sep: "" }];
    this.tail = split.blocks.length ? split.tail : "";
    this.rev += 1;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.headingIndex.clear();
    this.statsCache = null;
    this.emit("structure");
  }

  undo(): Sel | null {
    const patch = this.undoStack.pop();
    if (!patch) return null;
    const next = this.blocks.slice();
    next.splice(patch.from, patch.inserted.length, ...patch.removed.map((b) => ({ ...b })));
    this.blocks = next;
    this.tail = patch.tailBefore;
    this.rev += 1;
    this.redoStack.push(patch);
    this.statsCache = null;
    this.emit("structure");
    return patch.selBefore;
  }

  redo(): Sel | null {
    const patch = this.redoStack.pop();
    if (!patch) return null;
    const next = this.blocks.slice();
    next.splice(patch.from, patch.removed.length, ...patch.inserted.map((b) => ({ ...b })));
    this.blocks = next;
    this.tail = patch.tailAfter;
    this.rev += 1;
    this.undoStack.push(patch);
    this.statsCache = null;
    this.emit("structure");
    return patch.selAfter;
  }

  /* ---------- 派生数据（按需、带修订校验） ---------- */

  outline(): HeadingEntry[] {
    const out: HeadingEntry[] = [];
    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      const cached = this.headingIndex.get(block.id);
      if (cached && cached.rev === this.rev) {
        if (cached.level <= 5 && cached.text) {
          out.push({ level: cached.level, text: cached.text, blockId: block.id, index: i });
        }
        continue;
      }
      const info = parseBlock(block.raw);
      if (info.kind !== "heading") continue;
      const level = info.level ?? 1;
      const text = info.text.trim();
      this.headingIndex.set(block.id, { rev: this.rev, level, text });
      if (level <= 5 && text) out.push({ level, text, blockId: block.id, index: i });
    }
    return out;
  }

  stats(): Stats {
    if (this.statsCache && this.statsCache.rev === this.rev) return this.statsCache.value;
    let chars = 0;
    let words = 0;
    let lines = 0;
    for (const block of this.blocks) {
      const info = parseBlock(block.raw);
      const text = info.kind === "code" ? (info.code?.body ?? "") : info.text;
      chars += text.length;
      words += countWords(text);
      lines += block.raw ? block.raw.split("\n").length : 1;
    }
    const value: Stats = {
      chars,
      words,
      lines,
      blocks: this.blocks.length,
      readingMinutes: Math.max(1, Math.round(words / 300)),
    };
    this.statsCache = { rev: this.rev, value };
    return value;
  }

  dispose(): void {
    this.listeners.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.headingIndex.clear();
  }
}

export function countWords(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z0-9_'\u00c0-\u024f]+/g) ?? []).length;
  return cjk + latin;
}

/* ---------- 会话注册表：切换笔记复用同一会话（对齐 nomo 每文档一个 owner） ---------- */

const registry = new Map<string, DocSession>();

export function getSession(id: string, source: string): DocSession {
  const existing = registry.get(id);
  if (existing) {
    const incoming = normalizeNewlines(source);
    if (!existing.dirty && existing.editableSource !== incoming) {
      existing.replaceAll(source);
      existing.markSaved();
    }
    return existing;
  }
  const created = new DocSession(id, source);
  created.markSaved();
  registry.set(id, created);
  return created;
}

export function dropSession(id: string): void {
  const session = registry.get(id);
  if (session) {
    session.dispose();
    registry.delete(id);
  }
}

export function eachSession(fn: (session: DocSession) => void): void {
  for (const session of registry.values()) fn(session);
}