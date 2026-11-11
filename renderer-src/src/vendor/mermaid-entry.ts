/**
 * Mermaid 独立包入口（按需加载）。
 * 主 bundle 只在文档真的出现 mermaid 图时才注入 assets/mermaid.bundle.js，
 * 避免为少数文档在启动期解析 ~7 MB 的图表引擎（含 cytoscape/dagre）。
 */
import mermaid from "mermaid";

let theme = "";

export function renderChart(code: string, mode: "dark" | "default"): Promise<string> {
  if (theme !== mode) {
    theme = mode;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: mode,
      fontFamily: '"Segoe UI", "Microsoft YaHei", -apple-system, sans-serif',
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
      themeVariables: { fontSize: "15px" },
    });
  }
  const id = "pi-md-mmd-" + Math.random().toString(36).slice(2, 9);
  return mermaid.render(id, code).then((result) => result.svg);
}