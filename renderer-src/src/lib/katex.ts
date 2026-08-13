import katex from "katex";

/**
 * KaTeX 渲染：官方 toastui katex 插件已从 npm 下架，这里用
 * MutationObserver + 文本节点正则替换实现，预览与导出共用。
 *
 * - 块级公式  $$...$$
 * - 行内公式  $...$（首尾不允许空白，避免误伤价格等普通文本）
 */

const BLOCK_RE = /\$\$([\s\S]+?)\$\$/g;
const INLINE_MULTI = /\$([^\s$][^$\n]*[^\s$])\$/g;
const INLINE_SINGLE = /\$([^\s$])\$/g;

function renderText(text: string): string {
  return text
    .replace(BLOCK_RE, (_m, tex: string) =>
      katex.renderToString(tex.trim(), {
        displayMode: true,
        throwOnError: false,
      }),
    )
    .replace(INLINE_MULTI, (_m, tex: string) =>
      katex.renderToString(tex.trim(), {
        displayMode: false,
        throwOnError: false,
      }),
    )
    .replace(INLINE_SINGLE, (_m, tex: string) =>
      katex.renderToString(tex, {
        displayMode: false,
        throwOnError: false,
      }),
    );
}

export function processKatex(container: HTMLElement | null | undefined): void {
  if (!container || !container.isConnected) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.nodeValue ?? "";
    if (!value.includes("$")) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    // 跳过代码块 / 已有渲染结果
    if (parent.closest("code, pre, .katex, .token")) continue;
    targets.push(node);
  }
  for (const node of targets) {
    const value = node.nodeValue ?? "";
    const html = renderText(value);
    if (html === value) continue;
    const frag = document.createRange().createContextualFragment(html);
    node.replaceWith(frag);
  }
}
