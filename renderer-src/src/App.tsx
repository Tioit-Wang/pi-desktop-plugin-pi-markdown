import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useAppDispatch, useAppState } from "./store";
import type { DropPos, ExportKind, NoteNode, TreeNode } from "./types";
import { EXTERNAL_NOTE_ID } from "./types";
import {
  countNotes,
  countNodes,
  findNote,
  isDescendant,
  parseOutline,
  searchTree,
} from "./lib/tree";
import {
  exitExternalFile,
  fetchDataDir,
  fetchLocale,
  hasBridge,
  loadInitial,
  persistToHost,
  pullExternalFile,
  saveExternalFile,
} from "./bridge";
import { exportNote } from "./lib/exporters";
import { toast, ToastHost } from "./lib/toast";
import { setLocale, subscribeLocale, t } from "./lib/i18n";
import { WELCOME_MD } from "./welcome";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import EditorPane, { type EditorApi } from "./components/EditorPane";
import ContextMenu, { type MenuState } from "./components/ContextMenu";
import Modal, { type ModalState } from "./components/Modal";

/** 外部文件会话轮询间隔（主进程侧同样以 1s 心跳保活） */
const EXTERNAL_POLL_MS = 1000;

function AppInner() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [activeHeading, setActiveHeading] = useState(-1);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, setLocaleVersion] = useState(0);
  const editorApiRef = useRef<EditorApi | null>(null);

  /* 语言：从宿主拉取（优先官方外观适配器，其次 app.getLocale），并订阅变更 */
  useEffect(() => {
    void fetchLocale();
    const unsubscribe = subscribeLocale(() => {
      // 语言切换 → 重渲染全部文案（编辑器在创建 effect 内按 locale 重建）
      setLocaleVersion((v) => v + 1);
    });
    // 官方外观适配器：语言实时推送（appear:changed → app.getAppearance）
    const app = (window as unknown as {
      __appearance?: {
        onLocaleChange?: (fn: (locale: string) => void) => (() => void) | void;
        onThemeChange?: (fn: (base: string) => void) => (() => void) | void;
      };
    }).__appearance;
    let offLocale: (() => void) | undefined;
    if (app?.onLocaleChange) {
      const off = app.onLocaleChange((locale) => {
        if (locale) setLocale(locale);
      });
      if (typeof off === "function") offLocale = off;
    }
    return () => {
      unsubscribe();
      offLocale?.();
    };
  }, []);

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
        themeSource: initial.themeSource,
      });
      if (initial.tree.length === 0) {
        dispatch({
          type: "newNote",
          parentId: null,
          title: t("common.newNote"),
          content: WELCOME_MD,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  /* 主题：应用到根元素（米白/黑夜），并随切换即时更新 */
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  /* 外部文件会话：轮询主进程待打开文件（open_file 工具驱动） */
  useEffect(() => {
    if (!hasBridge()) return;
    let alive = true;
    let timer = 0;
    const tick = async () => {
      try {
        const file = await pullExternalFile();
        if (!alive) return;
        if (file) {
          dispatch({ type: "externalOpen", file });
          toast(
            t("external.banner") + " — " + file.name,
          );
        }
      } catch {
        /* 单次失败不中断轮询 */
      }
      if (alive) timer = window.setTimeout(tick, EXTERNAL_POLL_MS);
    };
    timer = window.setTimeout(tick, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [dispatch]);

  /* 自动保存：树/活动笔记/主题变化 → 防抖 800ms；外部文件会话走 file.save */
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
      const { tree, activeId, theme, themeSource, externalFile } = stateRef.current;
      dispatch({ type: "setSave", status: "saving" });
      const save =
        externalFile && externalFile.content !== null
          ? saveExternalFile(externalFile.path, externalFile.content).then(() => true)
          : persistToHost(tree, activeId, theme, themeSource).then(() => true);
      syncChain.current = syncChain.current
        .then(() => save)
        .then(() => {
          dispatch({ type: "setSave", status: "saved", at: Date.now() });
        })
        .catch((err: unknown) => {
          dispatch({
            type: "setSave",
            status: "error",
            message: (err as Error)?.message ?? String(err),
          });
          toast(t("toast.saveFailed", { msg: (err as Error)?.message ?? String(err) }), "error");
        });
    }, 800);
  }, [state.tree, state.activeId, state.theme, state.themeSource, state.externalFile, dispatch]);

  /* 外部文件模式下的虚拟笔记（单文件编辑，不进入笔记树） */
  const activeNote = useMemo<NoteNode | null>(() => {
    if (state.externalFile) {
      return {
        id: EXTERNAL_NOTE_ID,
        type: "note",
        title: state.externalFile.name,
        content: state.externalFile.content,
        updatedAt: Date.now(),
      };
    }
    return state.activeId ? findNote(state.tree, state.activeId) : null;
  }, [state.externalFile, state.tree, state.activeId]);
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
            label: t("common.newNote"),
            icon: "M12 5v14M5 12h14",
            onClick: () => setModal({ kind: "new-note", parentId: node.id }),
          },
          {
            label: t("common.newFolder"),
            icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM12 11v4M10 13h4",
            onClick: () => setModal({ kind: "new-folder", parentId: node.id }),
          },
        );
      }
      items.push({
        label: t("common.rename"),
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
            label: t("editor.exportMarkdown"),
            icon: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z",
            onClick: () => handleExport("md", node.id),
          },
          {
            label: t("editor.exportHtml"),
            icon: "M8 9l-3 3 3 3M16 9l3 3-3 3",
            onClick: () => handleExport("html", node.id),
          },
          {
            label: t("editor.exportImage"),
            icon: "M3 5h18v14H3zM3 15l5-5 4 4 4-4 5 5",
            onClick: () => handleExport("png", node.id),
          },
        );
      }
      items.push({
        label: t("common.delete"),
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
        toast(t("toast.selectNoteFirst"), "error");
        return;
      }
      const api = editorApiRef.current;
      if (!api) {
        toast(t("toast.editorNotReady"), "error");
        return;
      }
      // 导出内容：活动笔记取编辑器最新内容，其余取树中已保存内容
      const markdown =
        note.id === activeNote?.id ? api.getMarkdown() : note.content;
      const kindLabel =
        kind === "md"
          ? t("toast.kindMd")
          : kind === "html"
            ? t("toast.kindHtml")
            : t("toast.kindPng");
      try {
        const result = exportNote(
          kind,
          note,
          () => markdown,
          (md) => api.getHtmlFromMarkdown(md),
        );
        if (result) {
          result
            .then(() => toast(t("toast.exported", { kind: kindLabel })))
            .catch((err) =>
              toast(t("toast.exportFailed", { msg: (err as Error)?.message ?? String(err) }), "error"),
            );
        } else {
          toast(t("toast.exported", { kind: kindLabel }));
        }
      } catch (err) {
        toast(t("toast.exportFailed", { msg: (err as Error)?.message ?? String(err) }), "error");
      }
    },
    [state.tree, activeNote, dispatch],
  );

  /* ---------- 移动（拖拽） ---------- */
  const handleMove = useCallback(
    (id: string, targetId: string, pos: DropPos) => {
      if (id === targetId) return;
      if (pos === "inside" && isDescendant(state.tree, id, targetId)) {
        toast(t("toast.cannotMoveInside"), "error");
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

  /* ---------- 退出外部文件会话 ---------- */
  const handleExitExternal = useCallback(() => {
    void exitExternalFile().finally(() => {
      dispatch({ type: "externalExit" });
    });
  }, [dispatch]);

  const inExternalMode = !!state.externalFile;

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
          collapsed={!sidebarOpen || inExternalMode}
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
          onExport={(kind) => handleExport(kind)}
          theme={state.theme}
          sidebarOpen={sidebarOpen && !inExternalMode}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          external={inExternalMode}
          onExitExternal={handleExitExternal}
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
