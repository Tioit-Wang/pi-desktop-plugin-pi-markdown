import Prism from "prismjs";
// 全部 Prism 语言（168+ 种），由 build.mjs 生成静态导入并打包进单文件
import "../generated/prism-imports";

/**
 * 确保全局 Prism 就绪。语言组件脚本通过全局 Prism 注册，
 * prismjs core 在导入时已设置 `window.Prism = Prism`，这里显式兜底。
 */
export function loadPrismLanguages(): Promise<void> {
  const win = window as unknown as { Prism?: typeof Prism };
  if (!win.Prism) win.Prism = Prism;
  return Promise.resolve();
}
