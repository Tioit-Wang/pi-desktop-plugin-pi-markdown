export interface NoteNode {
  id: string;
  type: "note";
  title: string;
  content: string;
  updatedAt: number;
}

export interface FolderNode {
  id: string;
  type: "folder";
  name: string;
  children: TreeNode[];
}

export type TreeNode = FolderNode | NoteNode;

export type DropPos = "before" | "inside" | "after";

export type ViewMode = "split" | "write" | "preview";

export type SideTab = "notes" | "outline";

export type SaveStatus = "saved" | "saving" | "error";

export interface SaveState {
  status: SaveStatus;
  at: number | null;
  message?: string;
}

export interface OutlineItem {
  level: number;
  text: string;
}

export interface SearchHit {
  node: NoteNode;
  path: string;
  snippet: string;
  inTitle: boolean;
}

export interface AppState {
  tree: TreeNode[];
  activeId: string | null;
  expanded: Record<string, boolean>;
  viewMode: ViewMode;
  tab: SideTab;
  query: string;
  saveState: SaveState;
  dataDir: string | null;
}

export type ExportKind = "md" | "html" | "png";
