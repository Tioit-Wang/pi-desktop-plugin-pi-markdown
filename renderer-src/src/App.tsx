/**
 * 面板外壳（nomo: ui/workspace.rs）
 *
 * 结构：rail 侧栏 + workspace 卡片（工具栏 / 纸面正文 / 悬浮状态栏）。
 * 数据：每篇笔记一个 DocSession（切换不丢撤销历史），树结构与主题仍走宿主桥接。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, useAppDispatch, useAppState } from "./store";
import type { DropPos, ExportKind, HeadingEntry, NoteNode, SearchHit, SideTab, TreeNode } from "./types";
import { EXTERNAL_NOTE_ID } from "./types";
import { countNodes, countNotes, findNote, isDescendant, searchTree } from "./lib/tree";
import {
  exitExternalFileNow,
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
import { WELCOME_MD, WELCOME_TITLE } from "./welcome";
import { getSession, type DocSession } from "./core/doc/session";
import { debounceTrailing } from "./core/perf/scheduler";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import StatusBar from "./components/StatusBar";
import ContextMenu, { type MenuState } from "./components/ContextMenu";
import Modal, { type ModalState } from "./components/Modal";
import Editor, { type EditorMode } from "./components/doc/Editor";
import SourcePane from "./components/doc/SourcePane";

const EXTERNAL_POLL_MS = 1000;
const SAVE_DEBOUNCE_MS = 800;

type EditingMode = EditorMode;

function AppInner() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const [mode, setMode] = useState<EditingMode>(() => {
    const stored = localStorage.getItem("pimd.mode.v1");
    return stored === "split" || stored === "source" ? stored : "wysiwyg";
  });
  const [width, setWidth] = useState(() => Number(localStorage.getItem("pimd.width.v1") ?? 78) || 78);
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem("pimd.zoom.v1") ?? 100) / 100 || 1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outline, setOutline] = useState<HeadingEntry[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [statsTick, setStatsTick] = useState(0);
  const [externalEditing, setExternalEditing] = useState(false);
  const [, setLocaleVersion] = useState(0);
  const commandRef = useRef<((name: string) => void) | null>(null);
  const sessionRef = useRef<DocSession | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ---------- 语言 / 主题 ---------- */
  useEffect(() => {
    void fetchLocale();
    const off = subscribeLocale(() => setLocaleVersion((v) => v + 1));
    const appearance = (window as unknown as {
      __appearance?: { onLocaleChange?: (fn: (locale: string) => void) => void };
    }).__appearance;
    appearance?.onLocaleChange?.((locale) => {
      if (locale) setLocale(locale);
    });
    return off;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    try {
      localStorage.setItem("pimd.theme.v1", state.theme);
    } catch {
      /* 忽略 */
    }
  }, [state.theme]);

  /* 主题来源：跟随宿主时同步宿主广播；手动覆盖时把面板选择钉住，
     避免宿主外观运行时改写 data-theme 把面板颜色“抢”回去。 */
  const themeRef = useRef(state.theme);
  themeRef.current = state.theme;
  const themeSourceRef = useRef(state.themeSource);
  themeSourceRef.current = state.themeSource;

  useEffect(() => {
    const appearance = (window as unknown as {
      __appearance?: { onThemeChange?: (fn: (base: string) => void) => void };
    }).__appearance;
    appearance?.onThemeChange?.((base) => {
      const next = base === "dark" ? "dark" : "light";
      if (themeSourceRef.current === "host") {
        dispatch({ type: "setThemeHost", theme: next });
      }
    });
    const observer = new MutationObserver(() => {
      if (themeSourceRef.current !== "manual") return;
      const applied = document.documentElement.dataset.theme;
      if (applied !== themeRef.current) {
        document.documentElement.dataset.theme = themeRef.current;
      }
    });
    observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [dispatch]);

  useEffect(() => {
    localStorage.setItem("pimd.mode.v1", mode);
  }, [mode]);
  useEffect(() => {
    localStorage.setItem("pimd.width.v1", String(width));
  }, [width]);
  useEffect(() => {
    localStorage.setItem("pimd.zoom.v1", String(Math.round(zoom * 100)));
  }, [zoom]);

  /* ---------- 初始化 ---------- */
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
        dispatch({ type: "newNote", parentId: null, title: WELCOME_TITLE, content: WELCOME_MD });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  /* ---------- 外部文件会话 ---------- */
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
          setExternalEditing(false);
          toast(t("external.previewBadge") + " — " + file.name);
        }
      } catch {
        /* 单次失败不中断 */
      }
      if (alive) timer = window.setTimeout(tick, EXTERNAL_POLL_MS);
    };
    timer = window.setTimeout(tick, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [dispatch]);

  useEffect(() => {
    const teardown = () => exitExternalFileNow();
    window.addEventListener("pagehide", teardown);
    window.addEventListener("beforeunload", teardown);
    return () => {
      window.removeEventListener("pagehide", teardown);
      window.removeEventListener("beforeunload", teardown);
    };
  }, []);

  /* ---------- 当前文档会话 ---------- */
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

  const session = useMemo<DocSession | null>(() => {
    if (state.externalFile) return getSession(EXTERNAL_NOTE_ID, state.externalFile.content);
    if (!activeNote) return null;
    return getSession(activeNote.id, activeNote.content);
  }, [state.externalFile, activeNote?.id, activeNote?.content]);
  sessionRef.current = session;

  const readOnly = !!state.externalFile && !externalEditing;

  /* 首屏正文可见打点（性能对照用，单次） */
  useEffect(() => {
    if (!session || document.querySelectorAll(".blk").length === 0) return;
    try {
      performance.mark("pi-first-blocks");
    } catch {
      /* 忽略 */
    }
  }, [session, statsTick]);

  /* ---------- 派生：大纲 / 统计（300ms 静默，最长 900ms 陈旧） ---------- */
  const refreshDerived = useMemo(
    () =>
      debounceTrailing(() => {
        const current = sessionRef.current;
        if (!current) return;
        setOutline(current.outline());
        setStatsTick((v) => v + 1);
      }, 300, 900),
    [],
  );

  useEffect(() => {
    if (!session) return;
    setOutline(session.outline());
    setStatsTick((v) => v + 1);
    const off = session.subscribe(() => refreshDerived());
    return () => {
      off();
      refreshDerived.cancel();
    };
  }, [session, refreshDerived]);

  /* ---------- 保存（防抖 800ms；外部文件写回原路径） ---------- */
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<number | null>(null);
  const pendingDirty = useRef<Set<string>>(new Set());

  const flushSave = useCallback(() => {
    const current = sessionRef.current;
    const snapshot = stateRef.current;
    if (!current || !current.dirty) return;
    const source = current.source;
    const isExternal = !!snapshot.externalFile;
    const rev = current.rev;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    dispatch({ type: "setSave", status: "saving" });
    saveChain.current = saveChain.current
      .then(async () => {
        if (isExternal && snapshot.externalFile) {
          await saveExternalFile(snapshot.externalFile.path, source);
          dispatch({ type: "externalSave", content: source });
        } else {
          const tree = withSessionContents(snapshot.tree);
          await persistToHost(tree, snapshot.activeId, snapshot.theme, snapshot.themeSource);
          dispatch({ type: "setContent", id: current.id, content: source });
        }
        if (current.rev === rev) current.markSaved();
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
  }, [dispatch]);

  const onDirty = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    pendingDirty.current.add(current.id);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const withSessionContents = (tree: TreeNode[]): TreeNode[] => {
    const current = sessionRef.current;
    if (!current) return tree;
    const walk = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map((node) => {
        if (node.type === "folder") return { ...node, children: walk(node.children) };
        if (node.id !== current.id) return node;
        return { ...node, content: current.source, updatedAt: Date.now() };
      });
    return walk(tree);
  };

  /* ---------- 搜索 ---------- */
  const searchHits = useMemo<SearchHit[]>(() => {
    if (!state.query.trim()) return [];
    const tree = session ? withSessionContents(state.tree) : state.tree;
    return searchTree(tree, state.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tree, state.query, session, statsTick]);

  const noteTotal = useMemo(() => countNotes(state.tree), [state.tree]);
  const stats = useMemo(
    () => (session ? session.stats() : { chars: 0, words: 0, lines: 0, blocks: 0, readingMinutes: 1 }),
    [session, statsTick],
  );

  /* ---------- 树操作 ---------- */
  const handleOpen = useCallback(
    (id: string) => {
      flushSave();
      dispatch({ type: "setActive", id });
      if (state.query) dispatch({ type: "setQuery", q: "" });
    },
    [dispatch, state.query, flushSave],
  );

  const handleContext = useCallback(
    (event: React.MouseEvent, node: TreeNode) => {
      event.preventDefault();
      const isFolder = node.type === "folder";
      const items: MenuState["items"] = [];
      if (isFolder) {
        items.push(
          { label: t("common.newNote"), onClick: () => setModal({ kind: "new-note", parentId: node.id }) },
          { label: t("common.newFolder"), onClick: () => setModal({ kind: "new-folder", parentId: node.id }) },
          { label: "", divider: true, onClick: () => undefined },
        );
      }
      items.push({
        label: t("common.rename"),
        onClick: () =>
          setModal({
            kind: "rename",
            id: node.id,
            current: isFolder ? node.name : node.title,
          }),
      });
      if (!isFolder) {
        items.push(
          { label: t("editor.exportMarkdown"), onClick: () => void handleExport("md", node.id) },
          { label: t("editor.exportHtml"), onClick: () => void handleExport("html", node.id) },
          { label: t("editor.exportImage"), onClick: () => void handleExport("png", node.id) },
        );
      }
      items.push({
        label: t("common.delete"),
        danger: true,
        onClick: () =>
          setModal({
            kind: "delete",
            id: node.id,
            name: isFolder ? node.name : node.title,
            childCount: isFolder ? countNodes(node.children) : 0,
          }),
      });
      setMenu({ x: event.clientX, y: event.clientY, items });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.tree, state.activeId],
  );

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

  const handleModalSubmit = useCallback(
    (value?: string) => {
      if (!modal) return;
      if (modal.kind === "new-note") {
        dispatch({ type: "newNote", parentId: modal.parentId, title: value || undefined });
      } else if (modal.kind === "new-folder") {
        dispatch({ type: "newFolder", parentId: modal.parentId, name: value || undefined });
      } else if (modal.kind === "rename") {
        dispatch({ type: "rename", id: modal.id, name: value ?? "" });
      } else {
        dispatch({ type: "remove", id: modal.id });
      }
      setModal(null);
    },
    [modal, dispatch],
  );

  /* ---------- 导出 ---------- */
  const handleExport = useCallback(
    async (kind: ExportKind, noteId?: string) => {
      const snapshot = stateRef.current;
      const target = noteId ? findNote(snapshot.tree, noteId) : activeNote;
      if (!target) {
        toast(t("toast.selectNoteFirst"), "error");
        return;
      }
      const current = sessionRef.current;
      const isActive = !noteId || noteId === current?.id;
      const blocks = isActive && current
        ? current.blocks
        : getSession(target.id, target.content).blocks;
      try {
        await exportNote(kind, target.title, blocks);
        toast(
          t("toast.exported", {
            kind:
              kind === "md" ? t("toast.kindMd") : kind === "html" ? t("toast.kindHtml") : t("toast.kindPng"),
          }),
        );
      } catch (err) {
        toast(t("toast.exportFailed", { msg: (err as Error)?.message ?? String(err) }), "error");
      }
    },
    [activeNote],
  );

  const runCommand = useCallback((name: string) => {
    if (name === "undo" || name === "redo") {
      commandRef.current?.(name);
      return;
    }
    commandRef.current?.(name);
  }, []);

  // 调试/自动化入口（面板内诊断用，不参与渲染）
  (window as unknown as { __piMarkdown?: unknown }).__piMarkdown = {
    session: () => sessionRef.current,
    blocks: () => sessionRef.current?.blocks.map((b) => b.raw) ?? [],
    source: () => sessionRef.current?.source ?? "",
    undo: () => sessionRef.current?.undo(),
    mode: () => mode,
    setMode,
  };

  const externalMode = !!state.externalFile;
  const title = activeNote ? (state.externalFile ? state.externalFile.name : activeNote.title) : "";

  return (
    <div className="app">
      <div className="workspace">
        <Sidebar
          tree={state.tree}
          activeId={state.activeId}
          expanded={state.expanded}
          tab={state.tab}
          query={state.query}
          outline={outline}
          searchHits={searchHits}
          activeHeadingId={activeHeadingId}
          collapsed={!sidebarOpen || externalMode}
          noteCount={noteTotal}
          onTab={(tab: SideTab) => dispatch({ type: "setTab", tab })}
          onQuery={(q) => dispatch({ type: "setQuery", q })}
          onOpen={handleOpen}
          onToggle={(id) => dispatch({ type: "toggleExpanded", id })}
          onMove={handleMove}
          onContext={handleContext}
          onNewNote={(parentId) => setModal({ kind: "new-note", parentId })}
          onNewFolder={(parentId) => setModal({ kind: "new-folder", parentId })}
          onNavigateHeading={(blockIndex) => {
            const current = sessionRef.current;
            const block = current?.blocks[blockIndex];
            if (block) setActiveHeadingId(block.id);
            editorApiRef.current?.scrollToBlock(blockIndex);
          }}
        />

        <main className="doc-pane">
          <Toolbar
            mode={mode}
            onMode={setMode}
            onCommand={runCommand}
            sidebarOpen={sidebarOpen && !externalMode}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onSearch={() => {
              setSidebarOpen(true);
              dispatch({ type: "setTab", tab: "notes" });
            }}
            onOutline={() => {
              setSidebarOpen(true);
              dispatch({ type: "setTab", tab: "outline" });
            }}
            outlineOpen={sidebarOpen && state.tab === "outline"}
            widthPercent={width}
            onWidth={setWidth}
            theme={state.theme}
            onToggleTheme={() =>
              dispatch({ type: "setTheme", theme: state.theme === "dark" ? "light" : "dark" })
            }
            onExport={(kind) => void handleExport(kind)}
            readOnly={readOnly}
            externalMode={externalMode}
            onEnterEdit={() => setExternalEditing(true)}
            onUndo={() => runCommand("undo")}
            onRedo={() => runCommand("redo")}
            title={title}
            onTitleChange={
              externalMode
                ? undefined
                : (value: string) =>
                    activeNote && dispatch({ type: "rename", id: activeNote.id, name: value })
            }
          />

          <div className="doc-surface">
            {!activeNote || !session ? (
              <EmptyState onCreate={() => dispatch({ type: "newNote", parentId: null })} />
            ) : mode === "source" ? (
              <SourcePane session={session} readOnly={readOnly} onDirty={onDirty} />
            ) : mode === "split" ? (
              <div className="split-view">
                <SourcePane session={session} readOnly={readOnly} onDirty={onDirty} />
                <div className="split-divider" />
                <Editor
                  session={session}
                  theme={state.theme}
                  mode="wysiwyg"
                  readOnly
                  onDirty={onDirty}
                  widthPercent={100}
                  zoom={zoom}
                  registerApi={registerEditorApi}
                  commandRef={commandRef}
                />
              </div>
            ) : (
              <Editor
                session={session}
                theme={state.theme}
                mode="wysiwyg"
                readOnly={readOnly}
                onDirty={onDirty}
                onHeadingChange={(index) => {
                  const block = session.blocks[index];
                  if (block) setActiveHeadingId(block.id);
                }}
                widthPercent={width}
                zoom={zoom}
                registerApi={registerEditorApi}
                commandRef={commandRef}
              />
            )}

            <StatusBar
              save={state.saveState}
              words={stats.words}
              chars={stats.chars}
              lines={stats.lines}
              readingMinutes={stats.readingMinutes}
              zoom={zoom}
              onZoom={setZoom}
              dataDir={state.dataDir}
              externalPath={state.externalFile?.path ?? null}
              mode={mode}
            />
          </div>
        </main>
      </div>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <Modal modal={modal} onClose={() => setModal(null)} onSubmit={handleModalSubmit} />
      <ToastHost />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate(): void }) {
  return (
    <div className="empty-state">
      <svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
        <path
          d="M13 6h14l9 9v27a3 3 0 01-3 3H13a3 3 0 01-3-3V9a3 3 0 013-3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path d="M27 6v9h9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 26h14M16 33h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <p>{t("editor.emptyHint")}</p>
      <button className="btn-primary" onClick={onCreate}>
        {t("common.newNote")}
      </button>
    </div>
  );
}

const editorApiRef: { current: { scrollToBlock(index: number): void } | null } = { current: null };

function registerEditorApi(api: { scrollToBlock(index: number): void } | null) {
  editorApiRef.current = api;
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}