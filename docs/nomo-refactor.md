# Pi Markdown 0.6.0：参照 nomo 的编辑器内核重构

> 参照对象：[nomo-md/nomo](https://github.com/nomo-md/nomo)（Rust + GPUI 原生 Markdown 编辑器）。
> 本文记录从中提取的实现要点、本次重构方案、代码映射与实测数据。
> 重构分支：`refactor/nomo-core`。

## 一、从 nomo 提取的要点

### 1. 编辑器架构

| nomo 的机制 | 源码位置 | 本插件对应 |
| --- | --- | --- |
| 文档会话持有正文、修订号、历史；控件只消费有界窗口，从不镜像全文 | `text_document/`、`nomo_mark/host.rs` | `src/core/doc/session.ts`（`DocSession`：块数组 + `rev` + 补丁栈） |
| 视图模式（语义 / 源码 / 双栏）共用同一会话与撤销历史 | `nomo_mark/window_panes.rs` | `Editor`、`SourcePane` 共享同一个 `DocSession`；`App` 在视图切换时不重建会话 |
| 编辑命令产生补丁而非重排版全文 | `nomo_mark/commands.rs` | `src/core/doc/ops.ts`（`splitBlock`/`mergeBackward`/`indentBlock`/`convertBlock`… 一律返回新选区） |
| 块是最小渲染与编辑单元，块内含真实源码坐标 | `markdown/blocks.rs`、`nomo_mark/parse.rs` | `src/core/md/blocks.ts`（`Block{raw, sep}` + 派生信息 LRU） |

### 2. 渲染流程

- nomo：`Group（≤32 KiB / ≤64 块）→ Block → DisplayList`，高度用 Fenwick 前缀和，估算 `bytes/160` 行并**按实测密度自校准**，滚动锚点用 `(字节锚点, 像素偏移)`。
- 本次：`块 → 窗口{start,end} → 只挂载窗口内块`，高度先按 kind 估算（`estimateHeight`）、再被 `offsetHeight` 实测替换，实测差异在「变更块位于视口上方」时补偿 `scrollTop`（滚动锚点）。上下用两个占位 div 撑开总高度。

### 3. 性能手段（常数直接照搬）

| 机制 | nomo 常数 | 本插件实现 |
| --- | --- | --- |
| 窗口/预取 | base 3 屏、前瞻 6 屏、保留 3 屏 | 可视区 ±0.75 屏 / +1.5 屏；单窗口 300 块硬上限 |
| 代码高亮缓存 | 8 MiB / 120 项，键含语言 + 全文校验 | `core/perf/highlight.ts` 同参数；单块 256 KiB、单行 8 KiB 降级 |
| 语法库按需 | 按需语法库 | 45 种语言懒 `require`，bundle 不再预注册 297 种 |
| 派生查询防抖 | `min(300 ms, 900 ms − 已脏时长)` | `debounceTrailing(fn, 300, 900)` 用于大纲/统计 |
| 分片预算 | 批处理 4 ms | `sliceWork(items, fn, 4)` |
| 过期结果丢弃 | `generation + revision` 守卫 | `RevGuard` / `SingleFlight`；内联与块解析按内容哈希缓存，编辑只失效该块 |
| 图表引擎 | 按需加载、退出回收 | `core/perf/mermaid-loader.ts` 首次用到才注入 `mermaid.bundle.js` |

### 4. UI 设计

- 令牌直接取自 `theme.rs`：rail `#f3f4f6` / surface `#fff` / 文档 `#fff`（暗色 `#1b1f24` / `#1f2328`），墨色 `#202428`、muted `#68707a`、边线 `#dfe3e8`、主色 `#2f7d6f`（暗 `#4fb3a0`）；圆角 4/8/12，控件高 28/34/38，阴影 `0 1px 4px` 与 `0 14px 34px`。
- 版式：正文 16/28，h1–h6 为 32/26/21/18/16/14.5（行高 ×1.35），代码 13/18；纸面列宽 45–90% 居中、上下留白 32。
- 组件几何：工具栏 44、工具按钮 32×28 r4、模式切换 34×28 + 140 ms 滑动指示条；文件树行距 30 / 行高 28 / 缩进 12、chevron 200 ms 旋转；代码卡片 r8、头部 38、语言为下拉、复制 32×26；弹层间隔 6 px、边缘留 8 px、放不下翻转、限高滚动、160 ms 淡入 + 3 px 位移；状态栏 h28 r8 mono 数字、hover 上浮 1 px；大纲行 32/24、缩进 16。

## 二、重构方案与落地结构

```
renderer-src/src/
  core/
    md/       types.ts  blocks.ts  inline.ts  katex.ts        # 块切分/派生信息、带偏移的行内解析、公式缓存
    doc/      session.ts  ops.ts                              # 会话与补丁、编辑命令
    perf/     lru.ts  scheduler.ts  highlight.ts  mermaid-loader.ts
    export/   html.ts                                         # 块 → HTML（导出与 PNG 复用）
  components/
    Toolbar.tsx  Sidebar.tsx  NoteTree.tsx  StatusBar.tsx
    Popup.tsx  Modal.tsx  ContextMenu.tsx  ToolIcons.tsx
    doc/  Editor.tsx  BlockView.tsx  Blocks.tsx  Inline.tsx  caret.ts  SourcePane.tsx
  design/     tokens.css  base.css  ui.css  doc.css
```

关键决定：

1. **移除 Milkdown/Crepe**（全量 ProseMirror 文档 + 16 MB 依赖是响应速度上限的主因），自研块级内核。
2. **块级 live preview**：块在非焦点态渲染真实排版（标记隐藏，片段带 `data-o` 源码偏移）；点进某块后该块变为 `contenteditable`，DOM 文本 == 块原文，光标与源码偏移 1:1（IME 与原生输入行为可预测）。任何时刻最多 1 个可编辑元素。
3. **编辑只动一块**：`session.setRaw` 静默替换该块并记账补丁，不触发全文解析；输入路径不 setState 整篇。
4. **撤销是补丁回放**：`splice()` 记录 `{from, removed, inserted, tail}`，同块 800 ms 内的连续输入自动合并。
5. **派生数据异步化**：大纲/统计 300/900 ms 防抖，搜索按查询串取消旧任务，异步回填前核对修订。
6. **按需资源**：语法包懒加载、Mermaid 独立包、公式 160 项 LRU、图片 `loading=lazy` + `decoding=async`。

## 三、验证与实测

同一份 217 KB / 2 192 块的混合文档（标题、段落、行内格式、任务、代码块、表格），在 PI-Desktop 内置浏览器面板 1024×768 下对比「0.5.0 构建（Milkdown Crepe）」与「0.6.0 构建」。两版都在页面内埋入同一 `performance.mark("pi-first-blocks")`，打字用 `execCommand('insertText')` + `requestAnimationFrame` 计延迟，滚动为 20 次 600 px 步进。

| 指标 | 0.5.0（旧） | 0.6.0（新） | 变化 |
| --- | ---: | ---: | --- |
| 首屏正文可见 | 1 347 ms | **398 ms** | 3.4× |
| 首次内容绘制 | 1 068 ms | **160 ms** | 6.7× |
| 初始 DOM 节点 | 15 126 | **654** | 23× |
| 滚动帧间隔（中位 / 最大） | 17 / 127 ms | **17 / 21 ms** | 尖峰 6× |
| 单字输入到下一帧（中位 / 平均 / 最大） | 28.1 / 29.3 / 42.9 ms | **16.7 / 16.1 / 16.9 ms** | 1.7× |
| 主 bundle | 14.85 MB js + 2.88 MB css | **1.58 MB js + 1.43 MB css** | −90% |
| 图表引擎 | 打进主包 | 7.53 MB 按需注入 | 首屏不付 |

功能回归（浏览器面板内逐项验证）：块激活/失焦渲染、Enter 拆块（引用块续 `> `）、行首 Backspace 合并、撤销/重做、`/` 插入菜单（14 项）→ 转代码/公式、任务勾选写回源码、`Ctrl+V` 分块粘贴、切换编辑/双栏/源码不丢内容、大纲生成与跳转、明暗主题切换（含 Mermaid 重绘）、KaTeX 行内与块级、Mermaid 按需加载、自动保存写回 `settings.json` 结构、导出 Markdown/HTML/PNG。
`npx tsc --noEmit` 与 `node build.mjs` 通过。

## 四、已知限制

- 语法高亮内置 45 种常用语言（原 297 种）；未列出的语言按纯文本显示，可在 `core/perf/highlight.ts` 的 `LOADERS` 增补。
- 源码模式回灌整篇（`replaceAll`），该模式内使用原生撤销；富文本模式才有补丁级撤销历史。
- 表格、HTML 块在块内以源码编辑，渲染态不可直接拖动列宽。
- 双栏为「可编辑源码 + 只读预览」；nomo 的双栏是两侧同一语义窗口。
- 性能数字来自内置浏览器面板（Chromium、100% 缩放）；宿主真实窗口的不同 DPI、缩放与 macOS/Linux 尚未实机验收。