/** hast 树（refractor.highlight 输出）序列化为 HTML，避免新增依赖 */

export interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  value?: string;
  children?: HastNode[];
}

export function hastToHtml(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "root") {
    return (node.children ?? []).map(hastToHtml).join("");
  }
  if (node.type !== "element" || !node.tagName) return "";
  const props = Object.entries(node.properties ?? {})
    .map(([k, v]) => {
      if (v == null || v === false) return "";
      const name = k === "className" ? "class" : k;
      const value = Array.isArray(v) ? v.join(" ") : String(v);
      if (value === "") return "";
      return ` ${name}="${value.replace(/"/g, "&quot;")}"`;
    })
    .join("");
  const children = (node.children ?? []).map(hastToHtml).join("");
  return `<${node.tagName}${props}>${children}</${node.tagName}>`;
}
