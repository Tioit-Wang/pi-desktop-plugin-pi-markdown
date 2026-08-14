import type { SaveState, ThemeMode } from "../types";

interface Props {
  saveState: SaveState;
  dataDir: string | null;
  noteCount: number;
  activeTitle: string | null;
  wordCount: number;
  theme: ThemeMode;
  onToggleTheme(): void;
}

export default function StatusBar({
  saveState,
  dataDir,
  noteCount,
  activeTitle,
  wordCount,
  theme,
  onToggleTheme,
}: Props) {
  const time = saveState.at
    ? new Date(saveState.at).toLocaleTimeString("zh-CN", { hour12: false })
    : "";
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-edge bg-panel px-4 text-[11px] text-faint">
      <span className="flex items-center gap-1.5 truncate">
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M3 7h18M3 12h18M3 17h12" />
        </svg>
        {dataDir
          ? `存储位置：${dataDir}`
          : "浏览器预览模式（localStorage 存储）"}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {activeTitle && <span>{wordCount} 字符</span>}
        <span>{noteCount} 篇笔记</span>
        <button
          onClick={onToggleTheme}
          title={theme === "dark" ? "切换到米白主题" : "切换到黑夜主题"}
          aria-label={theme === "dark" ? "切换到米白主题" : "切换到黑夜主题"}
          className="flex items-center gap-1.5 text-faint transition-colors hover:text-ink"
        >
          {theme === "dark" ? (
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
            </svg>
          )}
          {theme === "dark" ? "米白" : "黑夜"}
        </button>
        <span
          className={
            saveState.status === "error"
              ? "text-danger"
              : saveState.status === "saving"
                ? "text-ink"
                : ""
          }
        >
          {saveState.status === "saving"
            ? "保存中…"
            : saveState.status === "error"
              ? "保存失败"
              : time
                ? `已保存 ${time}`
                : "已就绪"}
        </span>
      </span>
    </footer>
  );
}
