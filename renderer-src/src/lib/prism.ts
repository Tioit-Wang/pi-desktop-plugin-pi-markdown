import Prism from "prismjs";

/**
 * 加载全部 Prism 语言（168+ 种）到 window.Prism。
 * 语言组件脚本通过全局 Prism 注册，prismjs core 在导入时已设置
 * `window.Prism = Prism`；先加载核心派生语言，再并行加载其余，
 * 让依赖 markup/css/clike/javascript 的语言都能完整注册。
 */

const CORE_LANGS = [
  "prism-markup.js",
  "prism-css.js",
  "prism-clike.js",
  "prism-javascript.js",
  "prism-markup-templating.js",
];

let loaded: Promise<void> | null = null;

export function loadPrismLanguages(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    // 确保全局 Prism 就绪（prismjs core 会自动设置，这里显式兜底）
    const win = window as unknown as { Prism?: typeof Prism };
    if (!win.Prism) win.Prism = Prism;

    const modules = import.meta.glob([
      "/node_modules/prismjs/components/prism-*.js",
      "!/node_modules/prismjs/components/prism-*.min.js",
    ]);
    const paths = Object.keys(modules).filter(
      (p) =>
        !p.endsWith(".min.js") &&
        !p.endsWith("prism-core.js") &&
        !p.endsWith("index.js"),
    );
    const loadAll = (list: string[]) =>
      Promise.all(list.map((p) => (modules[p] as () => Promise<unknown>)()));

    const corePaths = paths.filter((p) =>
      CORE_LANGS.some((name) => p.endsWith(name)),
    );
    await loadAll(corePaths);
    const rest = paths.filter((p) => !corePaths.includes(p));
    await loadAll(rest);
  })();
  return loaded;
}
