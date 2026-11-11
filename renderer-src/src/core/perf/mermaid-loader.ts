/**
 * Mermaid 按需加载器（nomo: 按需语法库/图表引擎的同款思路）。
 * 首次需要渲染图表时注入独立脚本，之后复用同一个全局实例。
 */
export interface MermaidApi {
  renderChart(code: string, mode: "dark" | "default"): Promise<string>;
}

type Global = { PiMermaid?: MermaidApi };

let pending: Promise<MermaidApi> | null = null;

export function loadMermaid(): Promise<MermaidApi> {
  const scope = window as unknown as Global;
  if (scope.PiMermaid) return Promise.resolve(scope.PiMermaid);
  if (pending) return pending;
  pending = new Promise<MermaidApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("assets/mermaid.bundle.js", document.baseURI).href;
    script.async = true;
    script.onload = () => {
      if (scope.PiMermaid) resolve(scope.PiMermaid);
      else reject(new Error("mermaid bundle unavailable"));
    };
    script.onerror = () => {
      pending = null;
      reject(new Error("failed to load mermaid bundle"));
    };
    document.head.appendChild(script);
  });
  return pending;
}