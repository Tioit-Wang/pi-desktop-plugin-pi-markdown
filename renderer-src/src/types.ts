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

export type SideTab = "notes" | "outline";

export type ThemeMode = "light" | "dark";

/**
 * 主题来源："host" = 跟随宿主主题（默认）；"manual" = 面板内手动切换（持久化覆盖）。
 */
export type ThemeSource = "host" | "manual";

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
  tab: SideTab;
  query: string;
  saveState: SaveState;
  dataDir: string | null;
  theme: ThemeMode;
  themeSource: ThemeSource;
  /** 非空 = 单文件预览模式（Agent 工具 preview_file 打开的外部文件） */
  externalFile: ExternalFile | null;
}

export type ExportKind = "md" | "html" | "png";

/** 外部文件（Agent 工具 preview_file 打开的只读预览会话，不进入笔记树） */
export interface ExternalFile {
  path: string;
  name: string;
  content: string;
}

/** 外部文件在编辑器中使用的虚拟笔记 id */
export const EXTERNAL_NOTE_ID = "__pi_md_external__";
