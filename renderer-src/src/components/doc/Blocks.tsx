/**
 * 各类块的只读渲染（nomo: markdown/render.rs 的 display list → DOM）。
 *
 * 性能约定：
 * - 全部 memo，props 只有「原文 + 索引 + 回调」，未变化的块不重渲染。
 * - 语法高亮走 8 MiB / 120 项 LRU，大块在空闲切片里算，先显示纯文本。
 * - 公式/Mermaid 结果按 (源码, 主题) 缓存，Mermaid 串行队列 + 300 ms 防抖。
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { LruCache } from "../../core/perf/lru";
import { mathHtml } from "../../core/md/katex";
import { highlight, LANGUAGE_OPTIONS } from "../../core/perf/highlight";
import { loadMermaid } from "../../core/perf/mermaid-loader";
import type { BlockInfo, CodeInfo, TableInfo } from "../../core/md/types";
import { Inline } from "./Inline";
import { parseInline } from "../../core/md/inline";
import { t } from "../../lib/i18n";

/* ---------- 公式 ---------- */

export const MathBlock = memo(function MathBlock({ tex }: { tex: string }) {
  const html = useMemo(() => mathHtml(tex, true), [tex]);
  return <div className="blk-math" dangerouslySetInnerHTML={{ __html: html }} />;
});

/* ---------- 代码 ---------- */

interface CodeProps {
  code: CodeInfo;
  onCopy: (text: string) => void;
  onSetLang?: (lang: string) => void;
}

const MAX_PREVIEW_LINES = 24;

export const CodeBlock = memo(function CodeBlock({ code, onCopy, onSetLang }: CodeProps) {
  const [html, setHtml] = useState<string | null>(() =>
    code.body.length <= 16384 ? highlight(code.body, code.lang) : null,
  );
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const lineCount = useMemo(() => code.body.split("\n").length, [code.body]);

  useEffect(() => {
    if (html !== null) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      setHtml(highlight(code.body, code.lang));
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idle) idle(run, { timeout: 200 });
    else window.setTimeout(run, 0);
    return () => {
      alive = false;
    };
  }, [code.body, code.lang, html]);

  const copy = () => {
    onCopy(code.body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const langs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGE_OPTIONS;
    return LANGUAGE_OPTIONS.filter((item) => item.label.toLowerCase().includes(q) || item.value.includes(q));
  }, [query]);

  return (
    <div className={"code-card" + (expanded ? " is-expanded" : "")}>
      <div className="code-head">
        <div className="code-lang-wrap">
          <button
            className="code-lang"
            onClick={() => onSetLang && setPickerOpen((v) => !v)}
            title={onSetLang ? t("editor.chooseLanguage") : undefined}
          >
            {code.lang || t("editor.plainText")}
            {onSetLang && <Chevron />}
          </button>
          {pickerOpen && onSetLang && (
            <div className="code-lang-menu" onMouseLeave={() => setPickerOpen(false)}>
              <input
                className="code-lang-search"
                autoFocus
                placeholder={t("editor.searchLanguage")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="code-lang-list">
                {langs.map((item) => (
                  <button
                    key={item.value || "text"}
                    className={"code-lang-item" + (item.value === code.lang ? " is-active" : "")}
                    onClick={() => {
                      setPickerOpen(false);
                      setQuery("");
                      onSetLang(item.value);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="code-actions">
          {lineCount > MAX_PREVIEW_LINES && (
            <button className="code-btn" onClick={() => setExpanded((v) => !v)} title={t("editor.expand")}>
              {expanded ? <ChevronDir up /> : <ChevronDir />}
            </button>
          )}
          <button className={"code-btn" + (copied ? " is-ok" : "")} onClick={copy} title={t("editor.copy")}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>
      <pre className="code-body">
        {html === null ? (
          <code>{code.body}</code>
        ) : (
          <code dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </pre>
    </div>
  );
});

/* ---------- Mermaid ---------- */

const mermaidCache = new LruCache<string>(24, 12 * 1024 * 1024, (k, v) => k.length * 2 + v.length * 2);
let mermaidQueue: Promise<unknown> = Promise.resolve();


async function renderMermaid(code: string, theme: string): Promise<string> {
  const key = theme + "\u0000" + code;
  const hit = mermaidCache.get(key);
  if (hit !== undefined) return hit;
  const job = mermaidQueue.then(async () => {
    const api = await loadMermaid();
    const svg = await api.renderChart(code, theme === "dark" ? "dark" : "default");
    mermaidCache.set(key, svg);
    return svg;
  });
  mermaidQueue = job.catch(() => undefined);
  return job;
}

export const MermaidBlock = memo(function MermaidBlock({ code, theme }: { code: string; theme: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    const timer = window.setTimeout(() => {
      renderMermaid(code, theme).then(
        (value) => {
          if (alive) setSvg(value);
        },
        (err: unknown) => {
          if (alive) setError((err as Error)?.message ?? String(err));
        },
      );
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [code, theme]);

  if (error) {
    return (
      <div className="mermaid-card is-error">
        <pre>{error}</pre>
      </div>
    );
  }
  return (
    <div className="mermaid-card">
      {svg ? (
        <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="mermaid-loading">{t("editor.renderLoading")}</div>
      )}
    </div>
  );
});

/* ---------- 表格 ---------- */

export const TableBlock = memo(function TableBlock({ table, base }: { table: TableInfo; base: number }) {
  const [head, ...body] = table.rows;
  return (
    <div className="table-wrap">
      <table className="doc-table">
        {table.header && head && (
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={i} style={alignStyle(table.align[i])}>
                  <Inline tokens={parseInline(cell.text)} base={base + cell.offset} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {(table.header ? body : table.rows).map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={alignStyle(table.align[ci])}>
                  <Inline tokens={parseInline(cell.text)} base={base + cell.offset} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function alignStyle(align: "left" | "center" | "right" | null | undefined) {
  return align ? { textAlign: align } : undefined;
}

/* ---------- 图片 / Front Matter ---------- */

export const ImageBlock = memo(function ImageBlock({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="image-fallback">{alt || src}</div>;
  return (
    <figure className="blk-image">
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      {alt && <figcaption>{alt}</figcaption>}
    </figure>
  );
});

export const FrontMatterBlock = memo(function FrontMatterBlock({
  pairs,
}: {
  pairs: { key: string; value: string }[];
}) {
  return (
    <div className="front-matter">
      {pairs.map((pair, i) => (
        <div className="fm-row" key={i}>
          <span className="fm-key">{pair.key}</span>
          <span className="fm-value">{pair.value}</span>
        </div>
      ))}
    </div>
  );
});

/* ---------- 小图标 ---------- */

export function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDir({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={up ? { transform: "rotate(180deg)" } : undefined}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="9" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 5V3.6A1.6 1.6 0 008.9 2H3.6A1.6 1.6 0 002 3.6v7.3A1.6 1.6 0 003.6 12.5H5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const InfoBadge = memo(function InfoBadge({ kind }: { kind: BlockInfo["kind"] }) {
  return <span className={"badge badge-" + kind}>{kind}</span>;
});

/* ---------- 复制反馈（统一入口） ---------- */

export function copyText(text: string): void {
  const clipboard = navigator.clipboard;
  if (clipboard?.writeText) {
    void clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text: string): void {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } catch {
    /* 忽略 */
  }
  document.body.removeChild(area);
}

export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}