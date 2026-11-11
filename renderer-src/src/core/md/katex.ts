/**
 * KaTeX 渲染缓存：行内与块级公式共用（160 项 / 4 MiB 上限）。
 */
import katex from "katex";
import { LruCache } from "../perf/lru";

const cache = new LruCache<string>(160, 4 * 1024 * 1024, (key, value) => key.length * 2 + value.length * 2);

export function mathHtml(tex: string, display: boolean): string {
  const key = (display ? "d:" : "i:") + tex;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false });
  } catch (err) {
    html = '<span class="math-error">' + ((err as Error)?.message ?? "math error") + "</span>";
  }
  cache.set(key, html);
  return html;
}