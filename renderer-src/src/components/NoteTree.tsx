/**
 * 文件树（nomo: ui/file_tree.rs + workspace/explorer_ui.rs）
 * 行高 28 / 行距 30、缩进每级 12px、chevron 200ms 旋转、悬停 #808080@0.08、
 * 选中行 accent 文字 + 600 字重 + sidebar_active 底。
 */
import { useState } from "react";
import type { DropPos, TreeNode } from "../types";
import { t } from "../lib/i18n";

interface Props {
  nodes: TreeNode[];
  depth: number;
  activeId: string | null;
  expanded: Record<string, boolean>;
  onOpen(id: string): void;
  onToggle(id: string): void;
  onContext(event: React.MouseEvent, node: TreeNode): void;
  onMove(id: string, targetId: string, pos: DropPos): void;
}

interface DropState {
  id: string;
  pos: DropPos;
}

export default function NoteTree({
  nodes,
  depth,
  activeId,
  expanded,
  onOpen,
  onToggle,
  onContext,
  onMove,
}: Props) {
  const [drop, setDrop] = useState<DropState | null>(null);

  return (
    <div className="tree-level">
      {nodes.map((node) => {
        const isFolder = node.type === "folder";
        const open = !!expanded[node.id];
        const active = activeId === node.id;
        return (
          <div key={node.id} className="tree-node">
            <div
              className={
                "tree-row" +
                (active ? " is-active" : "") +
                (drop && drop.id === node.id ? " drop-" + drop.pos : "")
              }
              style={{ paddingLeft: 8 + depth * 12 }}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", node.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientY - rect.top) / rect.height;
                const pos: DropPos = isFolder
                  ? ratio < 0.28
                    ? "before"
                    : ratio > 0.72
                      ? "after"
                      : "inside"
                  : ratio < 0.5
                    ? "before"
                    : "after";
                if (!drop || drop.id !== node.id || drop.pos !== pos) setDrop({ id: node.id, pos });
              }}
              onDragLeave={() => setDrop((prev) => (prev && prev.id === node.id ? null : prev))}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const dragged = event.dataTransfer.getData("text/plain");
                const pos = drop?.pos ?? "after";
                setDrop(null);
                if (dragged && dragged !== node.id) onMove(dragged, node.id, pos);
              }}
              onClick={() => (isFolder ? onToggle(node.id) : onOpen(node.id))}
              onDoubleClick={() => isFolder && onToggle(node.id)}
              onContextMenu={(event) => onContext(event, node)}
              title={isFolder ? node.name : node.title}
            >
              <span className="tree-chevron" data-open={isFolder ? String(open) : "none"}>
                {isFolder && (
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <span className="tree-icon">
                {isFolder ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      d="M1.8 4.4A1.4 1.4 0 013.2 3h2.6l1.2 1.3h4.8A1.4 1.4 0 0113.2 5.7v5.9a1.4 1.4 0 01-1.4 1.4H3.2a1.4 1.4 0 01-1.4-1.4z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="M9 1.8H4.6a1.3 1.3 0 00-1.3 1.3v9.8a1.3 1.3 0 001.3 1.3h6.8a1.3 1.3 0 001.3-1.3V5.4z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M9 1.8v3.6h3.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                )}
              </span>
              <span className="tree-label">{isFolder ? node.name : node.title || t("common.untitledNote")}</span>
            </div>
            {isFolder && open && node.children.length > 0 && (
              <NoteTree
                nodes={node.children}
                depth={depth + 1}
                activeId={activeId}
                expanded={expanded}
                onOpen={onOpen}
                onToggle={onToggle}
                onContext={onContext}
                onMove={onMove}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}