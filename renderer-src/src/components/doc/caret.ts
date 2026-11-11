/**
 * 光标/偏移工具：活动编辑块的 DOM 文本与块原文 1:1 对应，
 * 渲染块则靠 data-o（片段首字符的源码偏移）反查。
 */

export interface CaretRange {
  start: number;
  end: number;
}

function locate(root: HTMLElement, offset: number): { node: Text; off: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (remaining <= node.data.length) return { node, off: remaining };
    remaining -= node.data.length;
    node = walker.nextNode() as Text | null;
  }
  return null;
}

/** 活动编辑块中的选区偏移 */
export function caretIn(root: HTMLElement): CaretRange {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 };
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return { start: 0, end: 0 };
  return {
    start: textOffset(root, range.startContainer, range.startOffset),
    end: textOffset(root, range.endContainer, range.endOffset),
  };
}

/** 设置活动编辑块的光标/选区 */
export function setCaret(root: HTMLElement, start: number, end = start): void {
  const total = (root.textContent ?? "").length;
  const from = Math.max(0, Math.min(start, total));
  const to = Math.max(from, Math.min(end, total));
  const head = locate(root, from);
  const tail = locate(root, to) ?? head;
  const selection = window.getSelection();
  const range = document.createRange();
  if (!head || !tail) {
    range.selectNodeContents(root);
    range.collapse(true);
  } else {
    range.setStart(head.node, head.off);
    range.setEnd(tail.node, tail.off);
  }
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function textOffset(root: HTMLElement, node: Node, nodeOffset: number): number {
  if (node === root) {
    const children = Array.from(root.childNodes).slice(0, nodeOffset);
    return children.reduce((sum, child) => sum + (child.textContent ?? "").length, 0);
  }
  let sum = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode() as Text | null;
  while (text) {
    if (text === node) return sum + nodeOffset;
    sum += text.data.length;
    text = walker.nextNode() as Text | null;
  }
  return sum;
}

/**
 * 从鼠标位置换算源码偏移：先找最近的 data-o 基准元素，再累加其内部文字长度。
 * 渲染块里被隐藏的标记不占 DOM 文本，所以这个换算不会因隐藏标记而偏移。
 */
export function offsetFromPoint(blockEl: HTMLElement, x: number, y: number): number {
  const anyDoc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let nodeOffset = 0;
  if (anyDoc.caretRangeFromPoint) {
    const range = anyDoc.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      nodeOffset = range.startOffset;
    }
  } else if (anyDoc.caretPositionFromPoint) {
    const pos = anyDoc.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      nodeOffset = pos.offset;
    }
  }
  if (!node || !blockEl.contains(node)) return 0;

  let anchor: HTMLElement | null = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  let base = 0;
  while (anchor && anchor !== blockEl) {
    const attr = anchor.getAttribute("data-o");
    if (attr !== null) {
      base = Number(attr) || 0;
      break;
    }
    anchor = anchor.parentElement;
  }
  const scope = anchor && anchor !== blockEl ? anchor : blockEl;
  return base + textOffset(scope, node, nodeOffset);
}