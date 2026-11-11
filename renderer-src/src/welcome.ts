/** 首次启动的示例笔记，演示标题层级、任务列表、代码高亮与 KaTeX 公式 */
export const WELCOME_TITLE = "欢迎使用 Pi Markdown";

export const WELCOME_MD = `# 欢迎使用 Pi Markdown

这是一篇**示例笔记**，用于演示本应用的各项能力。你可以直接编辑或删除它。

## 功能速览

- **块级所见即所得**：正文按块渲染成真实排版；点进某一块直接改 Markdown 源码，移开焦点立刻回到排版结果
- **三种视图共用一份文档**：工具栏中间切换「所见即所得 / 双栏 / 源码」，撤销历史与选区都不丢
- 左侧笔记树（多级嵌套）与 **H1–H5 五级大纲**，大纲可折叠、点击跳转
- 代码块语法高亮：内置常用语言，语法包按需加载
- **Mermaid 图表**：写一个 mermaid 代码块即出图，随明暗主题切换
- Todo 任务列表：渲染态直接勾选，改动写回源码
- KaTeX 数学公式：行内 $E=mc^2$ 与块级公式都支持
- 导出 Markdown / HTML / 图像
- 全局搜索所有笔记（标题 + 内容）

## 键盘与快捷操作

- 在空段落输入 \`/\` 唤起插入菜单（标题、列表、任务、引用、提示块、代码、公式、表格……）
- \`Ctrl/Cmd + B / I / E\` 加粗、斜体、行内代码；\`Tab\` 缩进列表
- \`Enter\` 拆块（列表自动续号），行首 \`Backspace\` 合并或退出列表
- 右下角状态栏可查看字数、行数、阅读时间与缩放

## 数学公式

行内公式：质能方程 $E = mc^2$，欧拉恒等式 $e^{i\\pi} + 1 = 0$。

块级公式（傅里叶变换）：

$$
\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\, e^{-2\\pi i x \\xi} \\, dx
$$

## 代码示例

\`\`\`javascript
// 快速排序
function quickSort(arr) {
  if (arr.length <= 1) return arr;
  const [pivot, ...rest] = arr;
  return [
    ...quickSort(rest.filter((x) => x <= pivot)),
    pivot,
    ...quickSort(rest.filter((x) => x > pivot)),
  ];
}
\`\`\`

\`\`\`python
def fib(n: int) -> int:
    """斐波那契数列"""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
\`\`\`

## Mermaid 图表

\`\`\`mermaid
flowchart LR
  A[开始] --> B{能上网？}
  B -- 是 --> C[看文档]
  B -- 否 --> D[查本地缓存]
  C --> E[写笔记]
  D --> E
  E --> F[完成 🎉]
\`\`\`

## 任务清单

- [ ] 整理本周会议纪要
- [ ] 阅读《设计数据密集型应用》第三章
- [x] 提交季度总结
- [ ] 规划下周 OKR

> 提示：在左侧边栏右键笔记或文件夹，可以新建、重命名、删除与导出；
> 拖拽即可调整它们的位置。所有数据仅保存在本机。
`;