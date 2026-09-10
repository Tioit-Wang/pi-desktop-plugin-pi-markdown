import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * 代码块（CodeMirror）主题。
 *
 * 颜色全部走 CSS 变量（index.css 按 data-theme 注入），因此：
 * - 明暗切换无需重建扩展，已存在的代码块也即时换色；
 * - 取值与 Typora 两套默认主题一致（浅色 GitHub 色板 / 黑夜 night/codeblock.dark.css）。
 *
 * 注意：Crepe 的 CodeMirror feature 默认主题是 oneDark，且无法通过传 undefined
 * 关掉（构造时 defaultsDeep 会把默认值补回来）。Crepe 组装扩展的顺序是
 * 「theme（oneDark）→ config.extensions」，本扩展位于其后，按 CodeMirror
 * 后者优先的规则覆盖掉 oneDark 的底色与 token 配色。
 */
const typoraHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [tags.lineComment, tags.blockComment, tags.docComment], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], color: "var(--code-keyword)" },
  { tag: [tags.string, tags.special(tags.string), tags.character], color: "var(--code-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--code-number)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: "var(--code-function)" },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.definition(tags.typeName)], color: "var(--code-type)" },
  { tag: [tags.tagName, tags.angleBracket], color: "var(--code-tag)" },
  { tag: [tags.attributeName, tags.attributeValue], color: "var(--code-attr)" },
  { tag: [tags.propertyName, tags.variableName, tags.definition(tags.variableName)], color: "var(--code-punct)" },
  { tag: [tags.operator, tags.derefOperator], color: "var(--code-operator)" },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: "var(--code-punct)" },
  { tag: [tags.meta, tags.processingInstruction, tags.annotation], color: "var(--code-meta)" },
  { tag: [tags.heading, tags.strong, tags.definition(tags.heading)], color: "var(--code-heading)", fontWeight: "bold" },
  { tag: [tags.emphasis], color: "var(--code-heading)", fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "var(--code-link)", textDecoration: "underline" },
  { tag: [tags.escape, tags.regexp], color: "var(--code-number)" },
  { tag: tags.invalid, color: "var(--code-string)" },
]);

const typoraEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--code-bg)",
    color: "var(--code-ink)",
    fontFamily: "var(--code-font)",
    fontSize: "var(--code-size)",
  },
  // CodeMirror 的运行时注入样式晚于页面样式表，字体族必须在这里声明才生效
  // （写在 panel-polish.css 里会被它的 monospace 盖掉）。
  ".cm-scroller, .cm-content": {
    fontFamily: "var(--code-font)",
  },
  ".cm-content": {
    lineHeight: "1.6",
    padding: "8px 0",
    caretColor: "var(--code-caret)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--code-caret)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--code-selection)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--code-bg)",
    color: "var(--code-gutter)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "var(--code-activeline)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--code-activeline)" },
  ".cm-panels": {
    backgroundColor: "var(--code-bg)",
    color: "var(--code-ink)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--code-bg)",
    color: "var(--code-ink)",
    border: "1px solid var(--code-border, #e7eaed)",
  },
});

export const typoraCodeTheme = [
  typoraEditorTheme,
  syntaxHighlighting(typoraHighlight),
];
