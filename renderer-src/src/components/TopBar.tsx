import { useEffect, useRef, useState } from "react";
import type { ExportKind, SaveState, ViewMode } from "../types";

interface Props {
  viewMode: ViewMode;
  onViewMode(mode: ViewMode): void;
  onExport(kind: ExportKind): void;
  saveState: SaveState;
  noteCount: number;
  activeTitle: string | null;
  canExport: boolean;
}

const VIEW_MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: "split", label: "分屏", icon: "M4 5h16v14H4zM9 5v14" },
  { key: "write", label: "编辑", icon: "M12 5v14M5 12h14" },
  {
    key: "preview",
    label: "预览",
    icon: "M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  },
];

function SaveBadge({ saveState }: { saveState: SaveState }) {
  if (saveState.status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-faint">
        <span className="inline-block h-3 w-3 animate-spin border border-faint border-t-ink" />
        保存中…
      </span>
    );
  }
  if (saveState.status === "error") {
    return (
      <span className="text-xs text-danger">
        保存失败
        {saveState.message ? `：${saveState.message}` : ""}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-faint">
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
      {saveState.at
        ? `已保存 ${new Date(saveState.at).toLocaleTimeString("zh-CN", {
            hour12: false,
          })}`
        : "已保存"}
    </span>
  );
}

export default function TopBar({
  viewMode,
  onViewMode,
  onExport,
  saveState,
  noteCount,
  activeTitle,
  canExport,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [exportOpen]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-edge bg-panel px-4">
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-ink"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
        <span className="text-sm font-semibold tracking-wide text-ink">
          Pi Markdown
        </span>
        {activeTitle && (
          <>
            <span className="text-faint">/</span>
            <span className="max-w-[220px] truncate text-xs text-muted">
              {activeTitle}
            </span>
          </>
        )}
      </div>

      <div className="ml-6 flex items-center border border-edge bg-bg">
        {VIEW_MODES.map((v) => (
          <button
            key={v.key}
            title={v.label}
            onClick={() => onViewMode(v.key)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs transition-colors ${
              viewMode === v.key
                ? "bg-accent text-black"
                : "text-muted hover:bg-panel2 hover:text-ink"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d={v.icon} />
            </svg>
            {v.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-xs text-faint lg:inline">
          {noteCount} 篇笔记
        </span>
        <div ref={exportRef} className="relative">
          <button
            disabled={!canExport}
            onClick={() => setExportOpen((o) => !o)}
            className="flex items-center gap-1.5 border border-edge2 bg-panel2 px-3 py-1.5 text-xs text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            导出
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-44 border border-edge2 bg-panel2 py-1">
              {(
                [
                  {
                    kind: "md",
                    label: "Markdown 文件 (.md)",
                    icon: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z",
                  },
                  {
                    kind: "html",
                    label: "HTML 文件 (.html)",
                    icon: "M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12",
                  },
                  {
                    kind: "png",
                    label: "图像文件 (.png)",
                    icon: "M3 5h18v14H3zM3 15l5-5 4 4 4-4 5 5",
                  },
                ] as { kind: ExportKind; label: string; icon: string }[]
              ).map((item) => (
                <button
                  key={item.kind}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink hover:bg-panel"
                  onClick={() => {
                    setExportOpen(false);
                    onExport(item.kind);
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <SaveBadge saveState={saveState} />
      </div>
    </header>
  );
}
