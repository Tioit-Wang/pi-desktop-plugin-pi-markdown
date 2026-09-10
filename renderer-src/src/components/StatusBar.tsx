import type { SaveState, ThemeMode } from "../types";
import { getLocale, t } from "../lib/i18n";

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
    ? new Date(saveState.at).toLocaleTimeString(getLocale(), { hour12: false })
    : "";
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-edge bg-panel px-4 text-[11px] text-muted">
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
          ? t("status.storageLocation", { dir: dataDir })
          : t("status.previewMode")}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {activeTitle && (
          <span>{t("status.chars", { count: wordCount })}</span>
        )}
        <span>{t("status.notes", { count: noteCount })}</span>
        <button
          onClick={onToggleTheme}
          title={theme === "dark" ? t("status.toLight") : t("status.toDark")}
          aria-label={theme === "dark" ? t("status.toLight") : t("status.toDark")}
          className="flex items-center gap-1.5 text-muted transition-colors hover:text-ink"
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
          {theme === "dark" ? t("status.light") : t("status.dark")}
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
            ? t("status.saving")
            : saveState.status === "error"
              ? t("status.saveFailed")
              : time
                ? t("status.savedAt", { time })
                : t("status.ready")}
        </span>
      </span>
    </footer>
  );
}
