/**
 * 按需语法高亮（nomo: markdown/code_highlight.rs）。
 *
 * nomo 的做法是「按需语法库 + 双上限 LRU + 单块预算」，这里照搬：
 * - 语言包懒加载：只有文档里真的出现该语言才 require 对应语法（bundle 不再
 *   预先注册 297 种语言，直接省掉十几 MB 与启动期注册开销）。
 * - 命中/写入 8 MiB / 120 项 LRU（键 = 语言 + 全文校验）。
 * - 单块 256 KiB、单行 8 KiB 上限，超限降级为纯文本，不做半截高亮。
 */
import Prism from "prismjs";
import { LruCache } from "./lru";

declare const require: (id: string) => unknown;

// 组件包按全局 `Prism` 取词法引擎（见 prismjs/components/*.js 末尾的 IIFE 调用）
(window as unknown as { Prism: unknown }).Prism = Prism;

const MAX_BLOCK_BYTES = 256 * 1024;
const MAX_LINE_BYTES = 8 * 1024;

const LOADERS: Record<string, () => void> = {
  markup: () => require("prismjs/components/prism-markup"),
  xml: () => require("prismjs/components/prism-markup"),
  html: () => require("prismjs/components/prism-markup"),
  svg: () => require("prismjs/components/prism-markup"),
  css: () => require("prismjs/components/prism-css"),
  scss: () => require("prismjs/components/prism-scss"),
  less: () => require("prismjs/components/prism-less"),
  clike: () => require("prismjs/components/prism-clike"),
  javascript: () => require("prismjs/components/prism-javascript"),
  typescript: () => require("prismjs/components/prism-typescript"),
  jsx: () => require("prismjs/components/prism-jsx"),
  tsx: () => require("prismjs/components/prism-tsx"),
  json: () => require("prismjs/components/prism-json"),
  yaml: () => require("prismjs/components/prism-yaml"),
  toml: () => require("prismjs/components/prism-toml"),
  ini: () => require("prismjs/components/prism-ini"),
  bash: () => require("prismjs/components/prism-bash"),
  powershell: () => require("prismjs/components/prism-powershell"),
  python: () => require("prismjs/components/prism-python"),
  rust: () => require("prismjs/components/prism-rust"),
  go: () => require("prismjs/components/prism-go"),
  java: () => require("prismjs/components/prism-java"),
  kotlin: () => require("prismjs/components/prism-kotlin"),
  swift: () => require("prismjs/components/prism-swift"),
  c: () => require("prismjs/components/prism-c"),
  cpp: () => require("prismjs/components/prism-cpp"),
  csharp: () => require("prismjs/components/prism-csharp"),
  php: () => require("prismjs/components/prism-php"),
  ruby: () => require("prismjs/components/prism-ruby"),
  sql: () => require("prismjs/components/prism-sql"),
  graphql: () => require("prismjs/components/prism-graphql"),
  markdown: () => require("prismjs/components/prism-markdown"),
  diff: () => require("prismjs/components/prism-diff"),
  docker: () => require("prismjs/components/prism-docker"),
  nginx: () => require("prismjs/components/prism-nginx"),
  lua: () => require("prismjs/components/prism-lua"),
  r: () => require("prismjs/components/prism-r"),
  scala: () => require("prismjs/components/prism-scala"),
  dart: () => require("prismjs/components/prism-dart"),
  makefile: () => require("prismjs/components/prism-makefile"),
  objectivec: () => require("prismjs/components/prism-objectivec"),
  perl: () => require("prismjs/components/prism-perl"),
  haskell: () => require("prismjs/components/prism-haskell"),
  elixir: () => require("prismjs/components/prism-elixir"),
  erlang: () => require("prismjs/components/prism-erlang"),
  protobuf: () => require("prismjs/components/prism-protobuf"),
  zig: () => require("prismjs/components/prism-zig"),
  http: () => require("prismjs/components/prism-http"),
  regex: () => require("prismjs/components/prism-regex"),
};

const ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rs: "rust",
  golang: "go",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
  md: "markdown",
  htm: "markup",
  vue: "markup",
  jsonc: "json",
  json5: "json",
  ps1: "powershell",
  pwsh: "powershell",
  kt: "kotlin",
  "c++": "cpp",
  cs: "csharp",
  "c#": "csharp",
  txt: "text",
  plaintext: "text",
  text: "text",
  dockerfile: "docker",
  make: "makefile",
  mk: "makefile",
  objc: "objectivec",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
};

const loaded = new Set<string>();
const cache = new LruCache<string>(120, 8 * 1024 * 1024, (key, value) => key.length * 2 + value.length * 2);

/** 语言选择器用：能高亮的语言（展示名 → 值） */
export const LANGUAGE_OPTIONS: { label: string; value: string }[] = [
  { label: "Plain Text", value: "" },
  { label: "Bash", value: "bash" },
  { label: "C", value: "c" },
  { label: "C#", value: "csharp" },
  { label: "C++", value: "cpp" },
  { label: "CSS", value: "css" },
  { label: "Dart", value: "dart" },
  { label: "Diff", value: "diff" },
  { label: "Dockerfile", value: "docker" },
  { label: "Elixir", value: "elixir" },
  { label: "Erlang", value: "erlang" },
  { label: "Go", value: "go" },
  { label: "GraphQL", value: "graphql" },
  { label: "Haskell", value: "haskell" },
  { label: "HTML", value: "markup" },
  { label: "INI", value: "ini" },
  { label: "Java", value: "java" },
  { label: "JavaScript", value: "javascript" },
  { label: "JSON", value: "json" },
  { label: "JSX", value: "jsx" },
  { label: "Kotlin", value: "kotlin" },
  { label: "Less", value: "less" },
  { label: "Lua", value: "lua" },
  { label: "Makefile", value: "makefile" },
  { label: "Markdown", value: "markdown" },
  { label: "Mermaid", value: "mermaid" },
  { label: "Nginx", value: "nginx" },
  { label: "Objective-C", value: "objectivec" },
  { label: "Perl", value: "perl" },
  { label: "PHP", value: "php" },
  { label: "PowerShell", value: "powershell" },
  { label: "Protobuf", value: "protobuf" },
  { label: "Python", value: "python" },
  { label: "R", value: "r" },
  { label: "Ruby", value: "ruby" },
  { label: "Rust", value: "rust" },
  { label: "Scala", value: "scala" },
  { label: "SCSS", value: "scss" },
  { label: "SQL", value: "sql" },
  { label: "Swift", value: "swift" },
  { label: "TOML", value: "toml" },
  { label: "TypeScript", value: "typescript" },
  { label: "TSX", value: "tsx" },
  { label: "YAML", value: "yaml" },
  { label: "Zig", value: "zig" },
];

export function normalizeLang(lang: string): string {
  const lower = (lang || "").toLowerCase().trim();
  if (!lower) return "";
  if (lower === "mermaid") return "mermaid";
  if (lower === "math" || lower === "latex" || lower === "katex") return "math";
  return ALIASES[lower] ?? lower;
}

export function canHighlight(lang: string): boolean {
  const normalized = normalizeLang(lang);
  return normalized !== "" && normalized !== "text" && normalized !== "mermaid" && normalized !== "math" && normalized in LOADERS;
}

function ensureGrammar(lang: string): string | null {
  const normalized = normalizeLang(lang);
  if (!canHighlight(normalized)) return null;
  if (!loaded.has(normalized)) {
    try {
      LOADERS[normalized]();
      loaded.add(normalized);
    } catch {
      return null;
    }
  }
  const grammar = (Prism.languages as Record<string, unknown>)[normalized];
  return grammar ? normalized : null;
}

/** 高亮为 HTML（带缓存）。超预算或未知语言返回 null，调用方降级为纯文本。 */
export function highlight(code: string, lang: string): string | null {
  if (!code) return "";
  if (code.length > MAX_BLOCK_BYTES) return null;
  const grammarKey = ensureGrammar(lang);
  if (!grammarKey) return null;

  const cacheKey = grammarKey + "\u0000" + code;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const tooLong = code.split("\n", 400).some((line) => line.length > MAX_LINE_BYTES);
  if (tooLong) return null;

  try {
    const html = Prism.highlight(
      code,
      (Prism.languages as Record<string, Parameters<typeof Prism.highlight>[1]>)[grammarKey],
      grammarKey,
    );
    cache.set(cacheKey, html);
    return html;
  } catch {
    return null;
  }
}

/** 预加载：进入视口前把语法包准备好（避免滚动到代码块时才加载） */
export function preloadLang(lang: string): void {
  ensureGrammar(lang);
}