import type { SearchHit, TreeNode } from "../types";
import NoteTree from "./NoteTree";
import Outline from "./Outline";
import { t } from "../lib/i18n";

interface Props {
  tree: TreeNode[];
  activeId: string | null;
  expanded: Record<string, boolean>;
  tab: "notes" | "outline";
  query: string;
  outlineItems: { level: number; text: string }[];
  searchHits: SearchHit[];
  activeHeading: number;
  onTab(tab: "notes" | "outline"): void;
  onQuery(q: string): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
  onMove(id: string, targetId: string, pos: "before" | "inside" | "after"): void;
  onContextMenu(e: React.MouseEvent, node: TreeNode): void;
  onNewNote(parentId: string | null): void;
  onNewFolder(parentId: string | null): void;
  onNavigateHeading(index: number): void;
  collapsed: boolean;
}

export default function Sidebar({
  tree,
  activeId,
  expanded,
  tab,
  query,
  outlineItems,
  searchHits,
  activeHeading,
  onTab,
  onQuery,
  onOpen,
  onToggle,
  onMove,
  onContextMenu,
  onNewNote,
  onNewFolder,
  onNavigateHeading,
  collapsed,
}: Props) {
  if (collapsed) return null;
  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-r border-edge bg-panel">
      {/* 搜索框 */}
      <div className="p-3 pb-2">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            className="w-full border border-edge bg-bg py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-faint outline-none transition-colors focus:border-ink"
          />
          {query && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
              onClick={() => onQuery("")}
              title={t("common.clear")}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 标签切换 */}
      <div className="flex gap-1 px-3">
        {(
          [
            { key: "notes", label: t("sidebar.tabNotes") },
            { key: "outline", label: t("sidebar.tabOutline") },
          ] as const
        ).map((t2) => (
          <button
            key={t2.key}
            onClick={() => onTab(t2.key)}
            className={`px-3 py-1 text-xs transition-colors ${
              tab === t2.key
                ? "bg-sel font-medium text-onsel"
                : "text-muted hover:bg-panel2 hover:text-ink"
            }`}
          >
            {t2.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {query ? (
          searchHits.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-faint">
              {t("sidebar.noResults", { query })}
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {searchHits.map((hit) => (
                <button
                  key={hit.node.id}
                  onClick={() => onOpen(hit.node.id)}
                  className="border border-transparent px-2.5 py-2 text-left transition-colors hover:border-edge2 hover:bg-panel2"
                >
                  <div className="flex items-center gap-1.5">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5 shrink-0 text-faint"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
                      <path d="M14 3v5h5" />
                    </svg>
                    <span className="truncate text-xs font-medium text-ink">
                      {hit.node.title}
                    </span>
                    {hit.inTitle && (
                      <span className="shrink-0 bg-panel2 px-1 py-px text-[9px] text-ink">
                        {t("sidebar.titleBadge")}
                      </span>
                    )}
                  </div>
                  {hit.path && (
                    <p className="mt-0.5 truncate text-[10px] text-faint">
                      {hit.path}
                    </p>
                  )}
                  {!hit.inTitle && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">
                      {hit.snippet}
                    </p>
                  )}
                </button>
              ))}
              <p className="px-2 pt-1 text-center text-[10px] text-faint">
                {t("sidebar.resultCount", { count: searchHits.length })}
              </p>
            </div>
          )
        ) : tab === "notes" ? (
          <NoteTree
            nodes={tree}
            depth={0}
            activeId={activeId}
            expanded={expanded}
            onOpen={onOpen}
            onToggle={onToggle}
            onContext={onContextMenu}
            onMove={onMove}
          />
        ) : (
          <Outline
            items={outlineItems}
            activeIndex={activeHeading}
            onNavigate={onNavigateHeading}
          />
        )}
      </div>

      {/* 底部操作 */}
      {tab === "notes" && !query && (
        <div className="flex gap-2 border-t border-edge p-2">
          <button
            onClick={() => onNewNote(null)}
            className="flex flex-1 items-center justify-center gap-1.5 bg-accent py-1.5 text-xs text-onaccent transition-colors hover:bg-accent2"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("common.newNote")}
          </button>
          <button
            onClick={() => onNewFolder(null)}
            className="flex flex-1 items-center justify-center gap-1.5 border border-edge py-1.5 text-xs text-muted transition-colors hover:border-edge2 hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              <path d="M12 11v4M10 13h4" />
            </svg>
            {t("common.newFolder")}
          </button>
        </div>
      )}
    </aside>
  );
}

