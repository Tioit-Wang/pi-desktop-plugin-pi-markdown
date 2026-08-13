/** 首次启动的示例笔记，演示标题层级、任务列表、代码高亮与 KaTeX 公式 */
export const WELCOME_MD = `# 欢迎使用 Pi Markdown 📝

这是一篇**示例笔记**，用于演示本应用的各项能力。你可以直接编辑或删除它。

## 功能速览

- [x] Markdown 实时预览与**所见即所得**富文本双模式
- [x] 左侧文件夹笔记树（支持多级嵌套）与 **H1–H5 五级大纲**
- [x] 代码块 **168+ 种语言**语法高亮
- [x] Todo 任务列表（在预览中可直接勾选）
- [x] KaTeX 数学公式（行内 \`$...$\` 与块级 \`$$...$$\`）
- [ ] 导出 Markdown / HTML / 图像
- [ ] 全局搜索所有笔记（标题 + 内容）

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

## 任务清单

- [ ] 整理本周会议纪要
- [ ] 阅读《设计数据密集型应用》第三章
- [x] 提交季度总结
- [ ] 规划下周 OKR

> 提示：在左侧边栏右键笔记或文件夹，可以新建、重命名、删除与导出；
> 拖拽即可调整它们的位置。所有数据仅保存在本机。
`;
