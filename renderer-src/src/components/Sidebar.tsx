/**
 * 侧栏（nomo: ui/workspace.rs 的 rail + explorer + outline）
 * 250px rail 底色，头部 strip px8/pt10/pb6，搜索 26px，行高 28，大纲 32/24。
 */
import { useMemo, useState } from "react";
import type { DropPos, HeadingEntry, NoteNode, SideTab, SearchHit, TreeNode } from "../types";
import NoteTree from "./NoteTree";
import { t } from "../lib/i18n";

interface Props {
  tree: TreeNode[];
  activeId: string | null;
  expanded: Record<string, boolean>;
  tab: SideTab;
  query: string;
  outline: HeadingEntry[];
  searchHits: SearchHit[];
  activeHeadingId: string | null;
  collapsed: boolean;
  noteCount: number;
  onTab(tab: SideTab): void;
  onQuery(query: string): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
  onMove(id: string, targetId: string, pos: DropPos): void;
  onContext(event: React.MouseEvent, node: TreeNode): void;
  onNewNote(parentId: string | null): void;
  onNewFolder(parentId: string | null): void;
  onNavigateHeading(blockIndex: number): void;
}

export default function Sidebar({
  tree,
  activeId,
  expanded,
  tab,
  query,
  outline,
  searchHits,
  activeHeadingId,
  collapsed,
  noteCount,
  onTab,
  onQuery,
  onOpen,
  onToggle,
  onMove,
  onContext,
  onNewNote,
  onNewFolder,
  onNavigateHeading,
}: Props) {
  return (
    <aside className={"sidebar" + (collapsed ? " is-collapsed" : "")}>
      <div className="sidebar-head">
        <span className="sidebar-title">{t("sidebar.library")}</span>
        <span className="sidebar-count">{noteCount}</span>
        <div className="sidebar-actions">
          <button
            className="icon-btn"
            title={t("common.newNote")}
            onClick={() => onNewNote(null)}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M10 4.5v11M4.5 10h11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="icon-btn"
            title={t("common.newFolder")}
            onClick={() => onNewFolder(null)}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path
                d="M2.6 5.4A1.6 1.6 0 014.2 3.8h3l1.4 1.5h5.2a1.6 1.6 0 011.6 1.6v7.7a1.6 1.6 0 01-1.6 1.6H4.2a1.6 1.6 0 01-1.6-1.6z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="search-icon">
          <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.4 10.4L14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          placeholder={t("sidebar.searchPlaceholder")}
          onChange={(event) => onQuery(event.target.value)}
          spellCheck={false}
        />
        {query && (
          <button className="search-clear" onClick={() => onQuery("")} title={t("common.clear")}>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="sidebar-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "notes"}
          className={"tab" + (tab === "notes" ? " is-active" : "")}
          onClick={() => onTab("notes")}
        >
          {t("sidebar.tabNotes")}
        </button>
        <button
          role="tab"
          aria-selected={tab === "outline"}
          className={"tab" + (tab === "outline" ? " is-active" : "")}
          onClick={() => onTab("outline")}
        >
          {t("sidebar.tabOutline")}
        </button>
      </div>

      <div className="sidebar-body">
        {tab === "notes" ? (
          query.trim() ? (
            <SearchList query={query} hits={searchHits} activeId={activeId} onOpen={onOpen} />
          ) : (
            <NoteTree
              nodes={tree}
              depth={0}
              activeId={activeId}
              expanded={expanded}
              onOpen={onOpen}
              onToggle={onToggle}
              onContext={onContext}
              onMove={onMove}
            />
          )
        ) : (
          <OutlineList
            items={outline}
            activeId={activeHeadingId}
            onNavigate={onNavigateHeading}
          />
        )}
      </div>
    </aside>
  );
}

function SearchList({
  query,
  hits,
  activeId,
  onOpen,
}: {
  query: string;
  hits: SearchHit[];
  activeId: string | null;
  onOpen(id: string): void;
}) {
  if (hits.length === 0) {
    return <div className="sidebar-empty">{t("sidebar.noResults", { query })}</div>;
  }
  return (
    <div className="search-list">
      <div className="search-meta">{t("sidebar.resultCount", { count: hits.length })}</div>
      {hits.map((hit) => (
        <button
          key={hit.node.id}
          className={"search-hit" + (hit.node.id === activeId ? " is-active" : "")}
          onClick={() => onOpen(hit.node.id)}
          title={hit.path}
        >
          <span className="hit-title">
            {hit.node.title || t("common.untitledNote")}
            {hit.inTitle && <span className="hit-badge">{t("sidebar.titleBadge")}</span>}
          </span>
          <span className="hit-path">{hit.path}</span>
          {hit.snippet && <span className="hit-snippet">{hit.snippet}</span>}
        </button>
      ))}
    </div>
  );
}

function OutlineList({
  items,
  activeId,
  onNavigate,
}: {
  items: HeadingEntry[];
  activeId: string | null;
  onNavigate(blockIndex: number): void;
}) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const visible = useMemo(() => {
    const out: { item: HeadingEntry; parents: number[] }[] = [];
    const stack: HeadingEntry[] = [];
    for (const item of items) {
      while (stack.length && stack[stack.length - 1].level >= item.level) stack.pop();
      const parents = stack.map((s) => s.level);
      stack.push(item);
      if (parents.some((level) => collapsed[level])) continue;
      out.push({ item, parents });
    }
    return out;
  }, [items, collapsed]);

  if (items.length === 0) {
    return <div className="sidebar-empty">{t("outline.empty")}</div>;
  }

  return (
    <div className="outline-list">
      {visible.map(({ item }) => {
        const hasChildren = items.some((other) => other.level > item.level && other.index > item.index);
        const isCollapsed = !!collapsed[item.level];
        return (
          <div
            key={item.blockId}
            className={"outline-row" + (activeId === item.blockId ? " is-active" : "")}
            style={{ paddingLeft: 10 + (item.level - 1) * 16 }}
            onClick={() => onNavigate(item.index)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter") onNavigate(item.index);
            }}
          >
            {hasChildren ? (
              <button
                className={"outline-chevron" + (isCollapsed ? " is-collapsed" : "")}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollapsed((prev) => ({ ...prev, [item.level]: !prev[item.level] }));
                }}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                  <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <span className="outline-chevron is-empty" />
            )}
            <span className="outline-label">{item.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export type { NoteNode };