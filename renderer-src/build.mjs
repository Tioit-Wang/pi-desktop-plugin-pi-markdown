/**
 * PI-Desktop 面板构建脚本（esbuild）。
 *
 * 为什么不用 vite：宿主用 file:// 协议加载面板，module script 会被
 * Chromium 的 CORS 策略阻止；esbuild 的 IIFE 输出在 file:// 下可用。
 *
 * 产物：
 *   renderer/index.html      静态入口（普通 <script>/<link>）
 *   renderer/assets/app.js   单一 IIFE（React + 编辑器内核）
 *   renderer/assets/app.css  设计系统 + KaTeX
 *
 * 与旧版的区别：不再打包 Milkdown/Crepe（16 MB）与 refractor 全部 297 种语法，
 * 语法包改为运行时按需 require（见 src/core/perf/highlight.ts）。
 */
import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd(); // renderer-src
const OUT_DIR = path.join(ROOT, "..", "renderer", "assets");

await fs.mkdir(OUT_DIR, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, "src", "main.tsx")],
  bundle: true,
  format: "iife",
  outfile: path.join(OUT_DIR, "app.js"),
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: {
    ".woff2": "dataurl",
    ".woff": "dataurl",
    ".ttf": "dataurl",
    ".eot": "dataurl",
    ".otf": "dataurl",
    ".svg": "dataurl",
    ".png": "dataurl",
  },
  logLevel: "info",
});

await build({
  entryPoints: [path.join(ROOT, "src", "index.css")],
  bundle: true,
  outfile: path.join(OUT_DIR, "app.css"),
  loader: {
    ".woff2": "dataurl",
    ".woff": "dataurl",
    ".ttf": "dataurl",
    ".eot": "dataurl",
    ".otf": "dataurl",
  },
  logLevel: "info",
});

// 图表引擎单独成包：只有出现 mermaid 图时才注入（首屏不为它付解析成本）
await build({
  entryPoints: [path.join(ROOT, "src", "vendor", "mermaid-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "PiMermaid",
  outfile: path.join(OUT_DIR, "mermaid.bundle.js"),
  define: { "process.env.NODE_ENV": '"production"' },
  minify: false,
  logLevel: "silent",
});

const sizes = await Promise.all(
  ["app.js", "app.css", "mermaid.bundle.js"].map(async (name) => {
    const stat = await fs.stat(path.join(OUT_DIR, name));
    return `${name}: ${(stat.size / 1024 / 1024).toFixed(2)} MB`;
  }),
);
console.log("[build] done —", sizes.join(" | "));
