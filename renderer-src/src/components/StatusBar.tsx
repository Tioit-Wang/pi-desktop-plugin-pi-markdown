import type { SaveState } from "../types";

interface Props {
  saveState: SaveState;
  dataDir: string | null;
  noteCount: number;
  activeTitle: string | null;
  wordCount: number;
}

export default function StatusBar({
  saveState,
  dataDir,
  noteCount,
  activeTitle,
  wordCount,
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
