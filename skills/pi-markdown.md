---
name: Pi Markdown
description: Describe when the agent should follow this skill.
---

# Pi Markdown

本地 Markdown 笔记应用（PI-Desktop 插件 `local.pi-markdown`）。

## When to use

用户提到本插件的笔记、Markdown 编辑、大纲、导出等功能时使用。

## How to use

- 数据：权威数据位于插件数据目录
  `~/.pi-desktop/plugins/data/local.pi-markdown/settings.json`，
  结构为 `{ tree, activeNoteId, theme, themeSource, updatedAt }`
  （`theme` 为 `'light'|'dark'`，`themeSource` 为 `'host'|'manual'`，默认跟随宿主主题）。
  `tree` 为混合树：`{ id, type:'folder', name, children[] }` 与
  `{ id, type:'note', title, content, updatedAt }`（图片为 data URL 内嵌）。
- 面板：`renderer/index.html`（esbuild 构建产物，源码在 `renderer-src/`，
  `npm run build` 重新生成）。编辑器为自研块级内核（0.6.0 起，参照 nomo）：
  正文按块渲染成排版结果，点进某一块直接改该块 Markdown 源码，移开焦点回到排版；
  工具栏中间切换「编辑 / 双栏 / 源码」三视图，共用同一会话与撤销历史。
  `Enter` 拆块、行首 `Backspace` 合并、`Tab` 缩进列表、空块 `/` 唤起 14 项插入菜单，
  `Ctrl/Cmd+B/I/E` 包裹行内格式；代码高亮按需加载语法包（8 MiB / 120 项 LRU），
  Mermaid 图表引擎独立成包按需注入，派生数据（大纲/统计）300 ms 静默防抖。
  实现要点与实测数据见 `docs/nomo-refactor.md`。
  界面语言跟随宿主（`app.getLocale` 桥接通道），主题默认跟随宿主主题。
- 通道：面板 → 主进程走 `pluginBridge.invoke("skill.setEnabled", { id: "note.sync", tree, activeId, theme, themeSource })`，
  主进程 `onPanelInvoke` 归一化后落盘；`store.path` 返回数据目录；`app.getLocale` 返回宿主语言。
- Agent 工具 `preview_file`：按绝对路径以**只读预览**打开单个 Markdown/文本文件——
  正文读写直接用 Node.js 的 `fs`，不经宿主 `pi.fs` 网关，因此**无需目录授权**、
  任意绝对路径均可打开（仅 `.md/.markdown/.txt`、≤5MB、拒绝二进制，保留原 BOM）。
  面板 1s 轮询 `file.pull` 取走待打开文件并进入单文件模式（无侧边栏），
  以只读态渲染；用户点标题栏「编辑」后转可编辑，`file.save` 自动写回原文件。
  同一时刻只允许一个外部文件（占用中调用返回 `CONFLICT`，心跳 60s 过期可接管）；
  面板关闭时经同步通道发 `file.exit` 立即释放槽位。
