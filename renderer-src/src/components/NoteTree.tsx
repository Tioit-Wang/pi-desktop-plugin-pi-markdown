import { useRef, useState } from "react";
import type { DropPos, TreeNode } from "../types";

interface Props {
  nodes: TreeNode[];
  depth: number;
  activeId: string | null;
  expanded: Record<string, boolean>;
  onOpen(id: string): void;
  onToggle(id: string): void;
  onContext(e: React.MouseEvent, node: TreeNode): void;
  onMove(id: string, targetId: string, pos: DropPos): void;
}

interface DragOver {
  id: string;
  pos: DropPos;
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 ${open ? "text-ink" : "text-muted"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      {open ? (
        <path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
      ) : (
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      )}
    </svg>
  );
}

function NoteIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 ${active ? "text-ink" : "text-faint"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

function Row({
  node,
  depth,
  active,
  expanded,
  onOpen,
  onToggle,
  onContext,
  onMove,
}: {
  node: TreeNode;
  depth: number;
  active: boolean;
  expanded: boolean;
  onOpen(): void;
  onToggle(): void;
  onContext(e: React.MouseEvent): void;
  onMove(id: string, targetId: string, pos: DropPos): void;
}) {
  const [dragOver, setDragOver] = useState<DragOver | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const isFolder = node.type === "folder";

  return (
    <div
      draggable
      onDragStart={(e) => {
        dragIdRef.current = node.id;
        e.dataTransfer.setData("text/plain", node.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        dragIdRef.current = null;
        setDragOver(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        let pos: DropPos;
        if (isFolder && y > rect.height * 0.3 && y < rect.height * 0.7) {
          pos = "inside";
        } else {
          pos = y < rect.height / 2 ? "before" : "after";
        }
        setDragOver({ id: node.id, pos });
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const src = dragIdRef.current ?? e.dataTransfer.getData("text/plain");
        if (src && dragOver) onMove(src, node.id, dragOver.pos);
        dragIdRef.current = null;
        setDragOver(null);
      }}
      className={`group relative flex cursor-pointer select-none items-center gap-1.5 pr-2 text-[13px] transition-colors ${
        active
          ? "bg-accent text-black"
          : "text-muted hover:bg-panel2 hover:text-ink"
      }`}
      style={{ paddingLeft: `${depth * 14 + 8}px`, minHeight: 28 }}
      onClick={() => (isFolder ? onToggle() : onOpen())}
      onContextMenu={onContext}
      title={isFolder ? node.name : node.title}
    >
      {dragOver?.id === node.id && (
        <span
          className={`pointer-events-none absolute left-1 right-1 h-0.5 bg-ink ${
            dragOver.pos === "before"
              ? "top-0"
              : dragOver.pos === "after"
                ? "bottom-0"
                : ""
          }`}
        />
      )}
      {dragOver?.id === node.id && dragOver.pos === "inside" && (
        <span className="pointer-events-none absolute inset-0 border border-ink/70 bg-panel2" />
      )}

      {isFolder ? (
        <>
          <svg
            viewBox="0 0 24 24"
            className={`h-3 w-3 shrink-0 transition-transform ${
              expanded ? "rotate-90" : ""
            } text-faint`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <FolderIcon open={expanded} />
          <span className="truncate font-medium">{node.name}</span>
        </>
      ) : (
        <>
          <span className="w-3 shrink-0" />
          <NoteIcon active={active} />
          <span className="truncate">{node.title || "未命名笔记"}</span>
        </>
      )}

      {isFolder && (
        <span className="ml-auto shrink-0 text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
          {node.children.length}
        </span>
      )}
    </div>
  );
}

export default function NoteTree(props: Props) {
  const { nodes, depth } = props;
  return (
    <div className="flex flex-col gap-px">
      {nodes.map((node) => {
        const expanded = !!props.expanded[node.id];
        return (
          <div key={node.id}>
            <Row
              node={node}
              depth={depth}
              active={node.type === "note" && props.activeId === node.id}
              expanded={expanded}
              onOpen={() => props.onOpen(node.id)}
              onToggle={() => props.onToggle(node.id)}
              onContext={(e) => props.onContext(e, node)}
              onMove={props.onMove}
            />
            {node.type === "folder" && expanded && node.children.length > 0 && (
              <NoteTree
                nodes={node.children}
                depth={depth + 1}
                activeId={props.activeId}
                expanded={props.expanded}
                onOpen={props.onOpen}
                onToggle={props.onToggle}
                onContext={props.onContext}
                onMove={props.onMove}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
