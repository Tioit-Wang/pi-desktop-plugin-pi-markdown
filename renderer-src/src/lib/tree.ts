import type {
  DropPos,
  NoteNode,
  OutlineItem,
  SearchHit,
  TreeNode,
} from "../types";

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === "folder") {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findNote(nodes: TreeNode[], id: string): NoteNode | null {
  const node = findNode(nodes, id);
  return node && node.type === "note" ? node : null;
}

export function removeNode(nodes: TreeNode[], id: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.id === id) continue;
    if (n.type === "folder") {
      out.push({ ...n, children: removeNode(n.children, id) });
    } else {
      out.push(n);
    }
  }
  return out;
}

export function insertNode(
  nodes: TreeNode[],
  targetId: string,
  pos: DropPos,
  node: TreeNode,
): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.id === targetId) {
      if (pos === "before") {
        out.push(node, n);
      } else if (pos === "after") {
        out.push(n, node);
      } else if (n.type === "folder") {
        out.push({ ...n, children: [node, ...n.children] });
      } else {
        out.push(node, n);
      }
      continue;
    }
    if (n.type === "folder") {
      out.push({ ...n, children: insertNode(n.children, targetId, pos, node) });
    } else {
      out.push(n);
    }
  }
  return out;
}

export function insertAtRoot(nodes: TreeNode[], node: TreeNode): TreeNode[] {
  return [...nodes, node];
}

export function isDescendant(
  nodes: TreeNode[],
  parentId: string,
  maybeChildId: string,
): boolean {
  const parent = findNode(nodes, parentId);
  if (!parent || parent.type !== "folder") return false;
  return !!findNode(parent.children, maybeChildId);
}

export function collectNotes(nodes: TreeNode[]): NoteNode[] {
  const out: NoteNode[] = [];
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      if (n.type === "note") out.push(n);
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function countNotes(nodes: TreeNode[]): number {
  return collectNotes(nodes).length;
}

export function countNodes(nodes: TreeNode[]): number {
  let c = 0;
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      c += 1;
      if (n.type === "folder") walk(n.children);
    }
  };
  walk(nodes);
  return c;
}

export function nodePath(nodes: TreeNode[], id: string): string {
  const find = (ns: TreeNode[], trail: string[]): string[] | null => {
    for (const n of ns) {
      if (n.id === id) return trail;
      if (n.type === "folder") {
        const r = find(n.children, [...trail, n.name]);
        if (r) return r;
      }
    }
    return null;
  };
  const trail = find(nodes, []);
  return trail ? trail.join(" / ") : "";
}

export function makeSnippet(content: string, q: string, radius = 44): string {
  const idx = content.toLowerCase().indexOf(q);
  if (idx < 0) return content.slice(0, 90).replace(/\s+/g, " ");
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + q.length + radius);
  const slice = content.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + slice + (end < content.length ? "…" : "");
}

export function searchTree(nodes: TreeNode[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const walk = (ns: TreeNode[], trail: string[]) => {
    for (const n of ns) {
      if (n.type === "folder") {
        walk(n.children, [...trail, n.name]);
        continue;
      }
      const inTitle = n.title.toLowerCase().includes(q);
      const inBody = n.content.toLowerCase().includes(q);
      if (inTitle || inBody) {
        hits.push({
          node: n,
          path: trail.join(" / "),
          snippet: inTitle ? n.title : makeSnippet(n.content, q),
          inTitle,
        });
      }
    }
  };
  walk(nodes, []);
  hits.sort(
    (a, b) =>
      (b.inTitle ? 1 : 0) - (a.inTitle ? 1 : 0) ||
      b.node.updatedAt - a.node.updatedAt,
  );
  return hits.slice(0, 100);
}

/** 解析 Markdown 的 H1–H5 五级标题，作为大纲 */
export function parseOutline(md: string): OutlineItem[] {
  const out: OutlineItem[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^(#{1,5})\s+(.+?)\s*#*\s*$/);
    if (m) out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}

/** 更新树中某个节点的字段（不可变），返回新树或原树 */
export function updateNode(
  nodes: TreeNode[],
  id: string,
  patch: Partial<NoteNode> | Partial<{ name: string }>,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) {
      return n.type === "note"
        ? { ...n, ...(patch as Partial<NoteNode>) }
        : { ...n, ...(patch as Partial<{ name: string }>) };
    }
    if (n.type === "folder") {
      return { ...n, children: updateNode(n.children, id, patch) };
    }
    return n;
  });
}
