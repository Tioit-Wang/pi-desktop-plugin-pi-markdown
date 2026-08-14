# Pi Markdown

本地 Markdown 笔记应用（PI-Desktop 插件）。面板由 React + TypeScript + Tailwind 构建，编辑器为 **Milkdown Crepe**（真·所见即所得 Markdown，Typora 风格）。

## 功能

- **编辑体验**：单栏所见即所得 Markdown 编辑——输入 `# ` 即出标题、`- [ ]` 即出任务、`> ` 即出引用、```` ``` ```` 即出代码块、`$…$` / `$$…$$` 即出公式；`/` 唤起斜杠菜单（标题/列表/任务/表格/图片/代码块/公式），块左侧拖拽手柄可移动/换型；自动保存（800ms 防抖写盘）；中文界面。
- **双主题**：米白（默认，亲爽浅色）/ 黑夜两套主题，状态栏太阳/月亮按钮一键切换，偏好随 settings.json 持久化。
- **5 级目录**：左侧「笔记」标签为可嵌套文件夹树（层级不限，满足 5 级），「大纲」标签为当前笔记 H1–H5 五级标题，点击跳转、滚动联动高亮。
- **代码 / Todo / 公式**：代码块支持 **297 种语言**语法高亮（refractor/Prism 全量语言，随包离线加载）；任务列表 `- [ ]` / `- [x]` 编辑区直接勾选；KaTeX 公式（行内 `$...$`、块级 `$$...$$`，编辑与导出均渲染）。
- **导出**：Markdown 文件、自包含 HTML 文件（内嵌样式与字体）、PNG 图像（html2canvas）。导出由 Markdown 源码经编辑器 parser/serializer 渲染，块级公式转 KaTeX、代码块重新高亮，不依赖编辑器可视区域。
- **全局搜索**：侧边栏搜索框实时匹配全部笔记的标题与内容（防抖 300ms，标题命中优先，附上下文片段）。
- **侧边栏管理**：文件夹 / 笔记拖拽调整位置（插入线指示，禁止拖入自身后代）；右键菜单：新建笔记 / 新建子文件夹 / 重命名 / 删除 / 导出。

## 存储位置

- 权威数据：插件数据目录 `~/.pi-desktop/plugins/data/local.pi-markdown/settings.json`（`tree` 为笔记树，`theme` 为主题偏好，图片以 data URL 内嵌于正文，随笔记一并存储与导出）。
- 面板与主进程经宿主限定桥接通道 `skill.setEnabled → onPanelInvoke("note.sync")` 双向同步；无宿主环境（浏览器直接打开 renderer/index.html）自动降级为 localStorage，便于预览调试。
- 首次启动自动创建「欢迎使用 Pi Markdown」示例笔记。

## 构建

面板源码在 `renderer-src/`（React + TS + Tailwind，**esbuild** 构建——宿主以 `file://` 协议加载面板，module script 会被 Chromium CORS 阻止，故输出 IIFE 单文件 + 静态入口）：

```bash
cd renderer-src
npm install
npm run build     # 生成 src/generated/refractor-imports.ts + 产物 → ../renderer（index.html + assets/app.js + app.css）
npm run typecheck
```

## 开发

1. PI-Desktop → Plugins → Load development plugin，指向本目录（热重载）。
2. 命令面板运行「Pi Markdown：打开笔记」（窗口 1280×800）。
3. 修改 `renderer-src/` 后 `npm run build`；修改 `manifest.json` 权限需重新加载插件。

## 权限

- `ui.panel`：面板入口
- `agent.prompt.inject`：技能文档索引（`skills/pi-markdown.md`）

无网络请求、无工作区文件读写；数据仅存本机插件数据目录。
