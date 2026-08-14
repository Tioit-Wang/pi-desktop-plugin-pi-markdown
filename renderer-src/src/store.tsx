import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  AppState,
  DropPos,
  FolderNode,
  NoteNode,
  SideTab,
  ThemeMode,
  TreeNode,
} from "./types";
import {
  findNode,
  insertAtRoot,
  insertNode,
  isDescendant,
  removeNode,
  uid,
  updateNode,
} from "./lib/tree";

export type Action =
  | {
      type: "init";
      tree: TreeNode[];
      activeId: string | null;
      dataDir: string | null;
      theme: ThemeMode;
    }
  | { type: "newNote"; parentId: string | null; title?: string; content?: string }
  | { type: "newFolder"; parentId: string | null; name?: string }
  | { type: "rename"; id: string; name: string }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; targetId: string; pos: DropPos }
  | { type: "setActive"; id: string | null }
  | { type: "toggleExpanded"; id: string }
  | { type: "setTab"; tab: SideTab }
  | { type: "setQuery"; q: string }
  | { type: "setTheme"; theme: ThemeMode }
  | { type: "setContent"; id: string; content: string }
  | {
      type: "setSave";
      status: AppState["saveState"]["status"];
      at?: number | null;
      message?: string;
    };

const initialState: AppState = {
  tree: [],
  activeId: null,
  expanded: {},
  tab: "notes",
  query: "",
  saveState: { status: "saved", at: null },
  dataDir: null,
  theme: "light",
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "init":
      return {
        ...state,
        tree: action.tree,
        activeId: action.activeId,
        dataDir: action.dataDir,
        theme: action.theme,
        expanded: {},
      };

    case "newNote": {
      const node: NoteNode = {
        id: uid("n"),
        type: "note",
        title: action.title?.trim() || "新建笔记",
        content: action.content ?? "",
        updatedAt: Date.now(),
      };
      const tree =
        action.parentId && findNode(state.tree, action.parentId)
          ? insertNode(state.tree, action.parentId, "inside", node)
          : insertAtRoot(state.tree, node);
      const expanded =
        action.parentId && findNode(state.tree, action.parentId)
          ? { ...state.expanded, [action.parentId]: true }
          : state.expanded;
      return { ...state, tree, expanded, activeId: node.id };
    }

    case "newFolder": {
      const node: FolderNode = {
        id: uid("f"),
        type: "folder",
        name: action.name?.trim() || "新建文件夹",
        children: [],
      };
      const tree =
        action.parentId && findNode(state.tree, action.parentId)
          ? insertNode(state.tree, action.parentId, "inside", node)
          : insertAtRoot(state.tree, node);
      const expanded =
        action.parentId && findNode(state.tree, action.parentId)
          ? { ...state.expanded, [action.parentId]: true }
          : { ...state.expanded, [node.id]: true };
      return { ...state, tree, expanded };
    }

    case "rename": {
      const name = action.name.trim();
      if (!name) return state;
      return { ...state, tree: updateNode(state.tree, action.id, { name }) };
    }

    case "remove": {
      const tree = removeNode(state.tree, action.id);
      const activeId = state.activeId === action.id ? null : state.activeId;
      return { ...state, tree, activeId };
    }

    case "move": {
      const { id, targetId, pos } = action;
      if (id === targetId) return state;
      if (pos === "inside" && isDescendant(state.tree, id, targetId)) {
        return state;
      }
      const node = findNode(state.tree, id);
      if (!node) return state;
      const tree2 = removeNode(state.tree, id);
      const tree3 = insertNode(tree2, targetId, pos, node);
      const expanded =
        pos === "inside" && node.type === "note"
          ? { ...state.expanded, [targetId]: true }
          : state.expanded;
      return { ...state, tree: tree3, expanded };
    }

    case "setActive":
      return { ...state, activeId: action.id };

    case "toggleExpanded":
      return {
        ...state,
        expanded: {
          ...state.expanded,
          [action.id]: !state.expanded[action.id],
        },
      };

    case "setTab":
      return { ...state, tab: action.tab };

    case "setQuery":
      return { ...state, query: action.q };

    case "setTheme":
      return { ...state, theme: action.theme };

    case "setContent":
      return {
        ...state,
        tree: updateNode(state.tree, action.id, {
          content: action.content,
          updatedAt: Date.now(),
        }),
      };

    case "setSave":
      return {
        ...state,
        saveState: {
          status: action.status,
          at: action.at ?? state.saveState.at,
          message: action.message,
        },
      };

    default:
      return state;
  }
}

const StateCtx = createContext<AppState>(initialState);
const DispatchCtx = createContext<Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        {children}
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState(): AppState {
  return useContext(StateCtx);
}

export function useAppDispatch(): Dispatch<Action> {
  return useContext(DispatchCtx);
}
