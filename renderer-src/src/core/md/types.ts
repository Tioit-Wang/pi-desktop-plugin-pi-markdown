/**
 * 块级 Markdown 模型（对齐 nomo 的 Block / display-list 分层）。
 *
 * 设计要点（nomo: src-gpui/src/markdown/blocks.rs）：
 * - 一个 Block 只持有**自己的原文片段** `raw`，以及与前一块之间的空白 `sep`，
 *   因此 `joinBlocks()` 逐字节还原文件，补丁永远只动受影响的块。
 * - 派生信息（类型、标题级别、列表标记……）不存进 Block，而是由 `parseBlock`
 *   从 raw 纯函数推导并进 LRU 缓存 —— 编辑一块不会让其它块的缓存失效。
 */

export type BlockKind =
  | "paragraph"
  | "heading"
  | "code"
  | "math"
  | "quote"
  | "callout"
  | "list"
  | "task"
  | "table"
  | "hr"
  | "image"
  | "html"
  | "frontmatter"
  | "empty";

/** 文档里的一个块。`id` 在整个会话生命周期内稳定（滚动锚点、memo 依赖它）。 */
export interface Block {
  id: string;
  /** 块自身原文，不含与相邻块之间的空行 */
  raw: string;
  /** 与上一块之间的空白（含换行）。首块为 ""。序列化时原样拼回。 */
  sep: string;
}

export interface CodeInfo {
  /** 围栏后的语言标识，未注明为空串 */
  lang: string;
  /** 代码正文（围栏内） */
  body: string;
  /** 代码正文在 raw 中的起始偏移 */
  bodyOffset: number;
  fence: string;
}

export interface ListInfo {
  ordered: boolean;
  /** 行首缩进（空格数） */
  indent: number;
  /** 真实标记文本，如 "-"、"1."、"•" */
  marker: string;
  /** 有序列表起始编号 */
  number: number;
  /** 标记之后的正文起始偏移（raw 坐标） */
  contentOffset: number;
  checked: boolean | null;
}

export interface QuoteInfo {
  /** 去掉 `>` 前缀后的正文（保留块内换行） */
  body: string;
  /** 正文在 raw 中的起始偏移 */
  bodyOffset: number;
  /** 提示块类型，如 note/tip/warning；普通引用为 null */
  callout: string | null;
}

export interface TableInfo {
  rows: { text: string; offset: number }[][];
  align: ("left" | "center" | "right" | null)[];
  header: boolean;
}

export interface BlockInfo {
  kind: BlockKind;
  /** 规范化后的正文文本（标题去 #、列表去标记、引用去 >），供大纲/统计使用 */
  text: string;
  /** 正文在 raw 中的偏移，渲染与光标映射用 */
  bodyOffset: number;
  level?: number;
  code?: CodeInfo;
  list?: ListInfo;
  quote?: QuoteInfo;
  table?: TableInfo;
  image?: { src: string; alt: string; title: string; offset: number };
  frontmatter?: { key: string; value: string }[];
  /** 权威字符长度（派生统计用，避免重复 join 全文） */
  chars: number;
}

export interface HeadingEntry {
  level: number;
  text: string;
  blockId: string;
  /** 块在该文档中的序号（用于跳转） */
  index: number;
}
