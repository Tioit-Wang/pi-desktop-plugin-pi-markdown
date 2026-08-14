import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useAppDispatch, useAppState } from "./store";
import type { DropPos, ExportKind, TreeNode } from "./types";
import {
  countNotes,
  countNodes,
  findNote,
  isDescendant,
  parseOutline,
  searchTree,
} from "./lib/tree";
import { fetchDataDir, loadInitial, persistToHost } from "./bridge";
import { exportNote } from "./lib/exporters";
import { toast, ToastHost } from "./lib/toast";
import { WELCOME_MD } from "./welcome";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import EditorPane, { type EditorApi } from "./components/EditorPane";
import ContextMenu, { type MenuState } from "./components/ContextMenu";
import Modal, { type ModalState } from "./components/Modal";

function AppInner() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [activeHeading, setActiveHeading] = useState(-1);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const editorApiRef = useRef<EditorApi | null>(null);

  /* 初始化：读取权威数据（settings.json 或 localStorage） */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [initial, dir] = await Promise.all([loadInitial(), fetchDataDir()]);
      if (cancelled) return;
      dispatch({
        type: "init",
        tree: initial.tree,
        activeId: initial.activeId,
        dataDir: dir ?? initial.dataDir,
        theme: initial.theme,
      });
      if (initial.tree.length === 0) {
        dispatch({
          type: "newNote",
          parentId: null,
          title: "欢迎使用 Pi Markdown",
          content: WELCOME_MD,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* 主题：应用到根元素（米白/黑夜），并随切换即时更新 */
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  /* 自动保存：任何树/活动笔记/主题变化 → 防抖 800ms 同步到主进程 */
  const stateRef = useRef(state);
  stateRef.current = state;
  const skipFirst = useRef(true);
  const syncTimer = useRef<number | null>(null);
  const syncChain = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      const { tree, activeId, theme } = stateRef.current;
      dispatch({ type: "setSave", status: "saving" });
      syncChain.current = syncChain.current
        .then(() => persistToHost(tree, activeId, theme))
        .then(() => {
          dispatch({ type: "setSave", status: "saved", at: Date.now() });
        })
        .catch((err: unknown) => {
          dispatch({
            type: "setSave",
            status: "error",
            message: (err as Error)?.message ?? String(err),
          });
          toast(`保存失败：${(err as Error)?.message ?? String(err)}`, "error");
        });
    }, 800);
  }, [state.tree, state.activeId, state.theme, dispatch]);

  const activeNote = useMemo(
    () => (state.activeId ? findNote(state.tree, state.activeId) : null),
    [state.tree, state.activeId],
  );
  const outlineItems = useMemo(
    () => (activeNote ? parseOutline(activeNote.content) : []),
    [activeNote],
  );
  const searchHits = useMemo(
    () => searchTree(state.tree, state.query),
    [state.tree, state.query],
  );
  const noteTotal = useMemo(() => countNotes(state.tree), [state.tree]);

  const registerApi = useCallback((api: EditorApi | null) => {
    editorApiRef.current = api;
  }, []);

  /* ---------- 右键菜单 ---------- */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNode) => {
      e.preventDefault();
      const isFolder = node.type === "folder";
      const items: MenuState["items"] = [];
      if (isFolder) {
        items.push(
          {
            label: "新建笔记",
            icon: "M12 5v14M5 12h14",
            onClick: () => setModal({ kind: "new-note", parentId: node.id }),
          },
          {
            label: "新建子文件夹",
            icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM12 11v4M10 13h4",
            onClick: () => setModal({ kind: "new-folder", parentId: node.id }),
          },
        );
      }
      items.push({
        label: "重命名",
        icon: "M13 3l4 4L7 17l-4 1 1-4z",
        onClick: () =>
          setModal({
            kind: "rename",
            id: node.id,
            current: isFolder ? node.name : node.title,
          }),
      });
      if (!isFolder) {
        items.push(
          {
            label: "导出 Markdown",
            icon: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z",
            onClick: () => handleExport("md", node.id),
          },
          {
            label: "导出 HTML",
            icon: "M8 9l-3 3 3 3M16 9l3 3-3 3",
            onClick: () => handleExport("html", node.id),
          },
          {
            label: "导出图像",
            icon: "M3 5h18v14H3zM3 15l5-5 4 4 4-4 5 5",
            onClick: () => handleExport("png", node.id),
          },
        );
      }
      items.push({
        label: "删除",
        icon: "M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13",
        danger: true,
        onClick: () => {
          const childCount = isFolder ? countNodes(node.children) : 0;
          setModal({
            kind: "delete",
            id: node.id,
            name: isFolder ? node.name : node.title,
            childCount,
          });
        },
      });
      setMenu({ x: e.clientX, y: e.clientY, items });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.tree],
  );

  /* ---------- 导出 ---------- */
  const handleExport = useCallback(
    (kind: ExportKind, noteId?: string) => {
      const note = noteId ? findNote(state.tree, noteId) : activeNote;
      if (!note) {
        toast("请先选择一篇笔记", "error");
        return;
      }
      const api = editorApiRef.current;
      if (!api) {
        toast("编辑器尚未就绪", "error");
        return;
      }
      // 导出内容：活动笔记取编辑器最新内容，其余取树中已保存内容
      const markdown =
        note.id === activeNote?.id ? api.getMarkdown() : note.content;
      try {
        const result = exportNote(
          kind,
          note,
          () => markdown,
          (md) => api.getHtmlFromMarkdown(md),
        );
        if (result) {
          result
            .then(() =>
              toast(
                `已导出 ${kind === "md" ? "Markdown" : kind === "html" ? "HTML" : "PNG"} 文件`,
              ),
            )
            .catch((err) =>
              toast(`导出失败：${(err as Error)?.message ?? err}`, "error"),
            );
        } else {
          toast(`已导出 ${kind === "md" ? "Markdown" : "HTML"} 文件`);
        }
      } catch (err) {
        toast(`导出失败：${(err as Error)?.message ?? err}`, "error");
      }
    },
    [state.tree, activeNote, dispatch],
  );

  /* ---------- 移动（拖拽） ---------- */
  const handleMove = useCallback(
    (id: string, targetId: string, pos: DropPos) => {
      if (id === targetId) return;
      if (pos === "inside" && isDescendant(state.tree, id, targetId)) {
        toast("不能移动到自身内部", "error");
        return;
      }
      dispatch({ type: "move", id, targetId, pos });
    },
    [state.tree, dispatch],
  );

  const handleOpen = useCallback(
    (id: string) => {
      dispatch({ type: "setActive", id });
      if (state.query) dispatch({ type: "setQuery", q: "" });
    },
    [dispatch, state.query],
  );

  const handleModalSubmit = useCallback(
    (value?: string) => {
      if (!modal) return;
      if (modal.kind === "new-note") {
        dispatch({
          type: "newNote",
          parentId: modal.parentId,
          title: value || undefined,
        });
      } else if (modal.kind === "new-folder") {
        dispatch({
          type: "newFolder",
          parentId: modal.parentId,
          name: value || undefined,
        });
      } else if (modal.kind === "rename") {
        dispatch({ type: "rename", id: modal.id, name: value ?? "" });
      } else {
        dispatch({ type: "remove", id: modal.id });
      }
      setModal(null);
    },
    [modal, dispatch],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          tree={state.tree}
          activeId={state.activeId}
          expanded={state.expanded}
          tab={state.tab}
          query={state.query}
          outlineItems={outlineItems}
          searchHits={searchHits}
          activeHeading={activeHeading}
          onTab={(tab) => dispatch({ type: "setTab", tab })}
          onQuery={(q) => dispatch({ type: "setQuery", q })}
          onOpen={handleOpen}
          onToggle={(id) => dispatch({ type: "toggleExpanded", id })}
          onMove={handleMove}
          onContextMenu={handleContextMenu}
          onNewNote={(parentId) => setModal({ kind: "new-note", parentId })}
          onNewFolder={(parentId) => setModal({ kind: "new-folder", parentId })}
          onNavigateHeading={(index) =>
            editorApiRef.current?.scrollToHeading(index)
          }
        />
        <EditorPane
          note={activeNote}
          registerApi={registerApi}
          onHeadingChange={setActiveHeading}
          theme={state.theme}
        />
      </div>
      <StatusBar
        saveState={state.saveState}
        dataDir={state.dataDir}
        noteCount={noteTotal}
        activeTitle={activeNote?.title ?? null}
        wordCount={activeNote?.content.length ?? 0}
        theme={state.theme}
        onToggleTheme={() =>
          dispatch({
            type: "setTheme",
            theme: state.theme === "dark" ? "light" : "dark",
          })
        }
      />
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <Modal modal={modal} onClose={() => setModal(null)} onSubmit={handleModalSubmit} />
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
