/**
 * 轻量 i18n：面板语言跟随宿主（pi.app.getLocale → 桥接通道 app.getLocale）。
 * 词典为扁平键表，t(key, vars?) 支持 {var} 插值。
 */

export type UILocale = "zh-CN" | "en";

export function resolveLocale(locale: string | null | undefined): UILocale {
  return String(locale ?? "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

const zhCN = {
  /* 通用 */
  "common.newNote": "新建笔记",
  "common.newFolder": "新建文件夹",
  "common.rename": "重命名",
  "common.delete": "删除",
  "common.cancel": "取消",
  "common.confirm": "确定",
  "common.clear": "清空",
  "common.untitledNote": "未命名笔记",

  /* 侧边栏 */
  "sidebar.searchPlaceholder": "搜索全部笔记（标题 / 内容）",
  "sidebar.tabNotes": "笔记",
  "sidebar.tabOutline": "大纲",
  "sidebar.noResults": "未找到匹配「{query}」的笔记",
  "sidebar.titleBadge": "标题",
  "sidebar.resultCount": "共 {count} 条结果",

  /* 大纲 */
  "outline.empty": "当前笔记没有标题\n（使用 # ～ ##### 添加）",

  /* 状态栏 */
  "status.storageLocation": "存储位置：{dir}",
  "status.previewMode": "浏览器预览模式（localStorage 存储）",
  "status.chars": "{count} 字符",
  "status.notes": "{count} 篇笔记",
  "status.toLight": "切换到米白主题",
  "status.toDark": "切换到黑夜主题",
  "status.light": "米白",
  "status.dark": "黑夜",
  "status.saving": "保存中…",
  "status.saveFailed": "保存失败",
  "status.savedAt": "已保存 {time}",
  "status.ready": "已就绪",

  /* 弹窗 */
  "modal.newNoteTitle": "新建笔记",
  "modal.newFolderTitle": "新建文件夹",
  "modal.renameTitle": "重命名",
  "modal.deleteTitle": "删除确认",
  "modal.noteTitleLabel": "笔记标题",
  "modal.folderNameLabel": "文件夹名称",
  "modal.newNameLabel": "新名称",
  "modal.deleteConfirm": "确定要删除{name}（含 {count} 个子项）吗？此操作不可撤销。",
  "modal.deleteConfirmSimple": "确定要删除{name}吗？此操作不可撤销。",
  "modal.noteTitlePlaceholder": "输入笔记标题…",
  "modal.namePlaceholder": "输入名称…",

  /* 编辑器 */
  "editor.placeholder":
    "开始写作…（# 空格 建标题，/ 唤起菜单，$…$ 行内公式）",
  "editor.noteTitlePlaceholder": "笔记标题",
  "editor.exportNote": "导出笔记",
  "editor.collapseSidebar": "收起侧边栏",
  "editor.expandSidebar": "展开侧边栏",
  "editor.emptyHint": "从左侧选择一篇笔记，或新建一篇开始写作",
  "editor.exportMarkdown": "导出 Markdown",
  "editor.exportHtml": "导出 HTML",
  "editor.exportImage": "导出图像",
  "editor.imageTooLarge": "图片超过 8MB，未插入",
  "editor.imageReadFailed": "图片读取失败",
  "editor.mermaidError": "Mermaid 解析失败：{msg}",
  "editor.renderLoading": "渲染中…",
  "editor.copy": "复制",
  "editor.searchLanguage": "搜索语言…",
  "editor.noLanguage": "无匹配语言",
  "editor.edit": "编辑",
  "editor.hide": "隐藏",
  "editor.preview": "预览",
  "editor.linkPlaceholder": "输入链接地址…",
  "editor.blockText": "文本",
  "editor.blockParagraph": "正文",
  "editor.blockH1": "标题 1",
  "editor.blockH2": "标题 2",
  "editor.blockH3": "标题 3",
  "editor.blockH4": "标题 4",
  "editor.blockH5": "标题 5",
  "editor.blockH6": "标题 6",
  "editor.blockQuote": "引用",
  "editor.blockDivider": "分割线",
  "editor.blockList": "列表",
  "editor.blockBullet": "无序列表",
  "editor.blockOrdered": "有序列表",
  "editor.blockTask": "任务列表",
  "editor.blockAdvanced": "高级",
  "editor.blockImage": "图片",
  "editor.blockCode": "代码块",
  "editor.blockTable": "表格",
  "editor.blockMath": "公式",

  /* 外部文件（preview_file 只读预览会话） */
  "external.saveFailed": "保存失败：{msg}",
  "external.saved": "已保存 {name}",
  "external.waiting": "正在打开文件…",
  "external.previewBadge": "只读预览",
  "external.edit": "编辑",

  /* 提示 */
  "toast.saveFailed": "保存失败：{msg}",
  "toast.exported": "已导出 {kind} 文件",
  "toast.exportFailed": "导出失败：{msg}",
  "toast.selectNoteFirst": "请先选择一篇笔记",
  "toast.editorNotReady": "编辑器尚未就绪",
  "toast.cannotMoveInside": "不能移动到自身内部",
  "toast.editorInitFailed": "编辑器初始化失败：{msg}",
  "toast.kindMd": "Markdown",
  "toast.kindHtml": "HTML",
  "toast.kindPng": "PNG",
};

const en: Record<keyof typeof zhCN, string> = {
  "common.newNote": "New Note",
  "common.newFolder": "New Folder",
  "common.rename": "Rename",
  "common.delete": "Delete",
  "common.cancel": "Cancel",
  "common.confirm": "OK",
  "common.clear": "Clear",
  "common.untitledNote": "Untitled note",

  "sidebar.searchPlaceholder": "Search all notes (title / content)",
  "sidebar.tabNotes": "Notes",
  "sidebar.tabOutline": "Outline",
  "sidebar.noResults": "No notes match “{query}”",
  "sidebar.titleBadge": "Title",
  "sidebar.resultCount": "{count} results",

  "outline.empty": "No headings in this note\n(add them with # through #####)",

  "status.storageLocation": "Storage: {dir}",
  "status.previewMode": "Browser preview (localStorage)",
  "status.chars": "{count} chars",
  "status.notes": "{count} notes",
  "status.toLight": "Switch to light theme",
  "status.toDark": "Switch to dark theme",
  "status.light": "Light",
  "status.dark": "Dark",
  "status.saving": "Saving…",
  "status.saveFailed": "Save failed",
  "status.savedAt": "Saved {time}",
  "status.ready": "Ready",

  "modal.newNoteTitle": "New Note",
  "modal.newFolderTitle": "New Folder",
  "modal.renameTitle": "Rename",
  "modal.deleteTitle": "Confirm Delete",
  "modal.noteTitleLabel": "Note title",
  "modal.folderNameLabel": "Folder name",
  "modal.newNameLabel": "New name",
  "modal.deleteConfirm": "Delete {name} (with {count} items)? This cannot be undone.",
  "modal.deleteConfirmSimple": "Delete {name}? This cannot be undone.",
  "modal.noteTitlePlaceholder": "Enter a note title…",
  "modal.namePlaceholder": "Enter a name…",

  "editor.placeholder":
    "Start writing… (# space for a heading, / for the menu, $…$ for inline math)",
  "editor.noteTitlePlaceholder": "Note title",
  "editor.exportNote": "Export note",
  "editor.collapseSidebar": "Collapse sidebar",
  "editor.expandSidebar": "Expand sidebar",
  "editor.emptyHint": "Pick a note from the sidebar, or create one to start writing",
  "editor.exportMarkdown": "Export Markdown",
  "editor.exportHtml": "Export HTML",
  "editor.exportImage": "Export Image",
  "editor.imageTooLarge": "Image exceeds 8MB; not inserted",
  "editor.imageReadFailed": "Failed to read image",
  "editor.mermaidError": "Mermaid parse failed: {msg}",
  "editor.renderLoading": "Rendering…",
  "editor.copy": "Copy",
  "editor.searchLanguage": "Search language…",
  "editor.noLanguage": "No matching language",
  "editor.edit": "Edit",
  "editor.hide": "Hide",
  "editor.preview": "Preview",
  "editor.linkPlaceholder": "Enter a link URL…",
  "editor.blockText": "Text",
  "editor.blockParagraph": "Paragraph",
  "editor.blockH1": "Heading 1",
  "editor.blockH2": "Heading 2",
  "editor.blockH3": "Heading 3",
  "editor.blockH4": "Heading 4",
  "editor.blockH5": "Heading 5",
  "editor.blockH6": "Heading 6",
  "editor.blockQuote": "Quote",
  "editor.blockDivider": "Divider",
  "editor.blockList": "List",
  "editor.blockBullet": "Bullet list",
  "editor.blockOrdered": "Ordered list",
  "editor.blockTask": "Task list",
  "editor.blockAdvanced": "Advanced",
  "editor.blockImage": "Image",
  "editor.blockCode": "Code block",
  "editor.blockTable": "Table",
  "editor.blockMath": "Formula",

  "external.saveFailed": "Save failed: {msg}",
  "external.saved": "Saved {name}",
  "external.waiting": "Opening file…",
  "external.previewBadge": "Read-only preview",
  "external.edit": "Edit",

  "toast.saveFailed": "Save failed: {msg}",
  "toast.exported": "Exported {kind} file",
  "toast.exportFailed": "Export failed: {msg}",
  "toast.selectNoteFirst": "Select a note first",
  "toast.editorNotReady": "Editor is not ready",
  "toast.cannotMoveInside": "Cannot move into itself",
  "toast.editorInitFailed": "Editor initialization failed: {msg}",
  "toast.kindMd": "Markdown",
  "toast.kindHtml": "HTML",
  "toast.kindPng": "PNG",
};

export type I18nKey = keyof typeof zhCN;

const DICTS: Record<UILocale, Record<I18nKey, string>> = { "zh-CN": zhCN, en };

let current: UILocale = resolveLocale(
  typeof navigator !== "undefined" ? navigator.language : "en",
);
const listeners = new Set<() => void>();

export function getLocale(): UILocale {
  return current;
}

export function isZhLocale(): boolean {
  return current === "zh-CN";
}

/** 由宿主语言设置面板语言；变更时通知订阅者并同步 <html lang> */
export function setLocale(locale: string | null | undefined): void {
  const next = resolveLocale(locale);
  if (next === current) return;
  current = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  for (const fn of [...listeners]) fn();
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function t(
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  let text = DICTS[current][key] ?? zhCN[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
