/**
 * 工具栏（nomo: ui/workspace/toolbar.rs）
 * 高 44、px16、工具按钮 32×28 r4、模式切换 34×28 + 140ms 滑动指示条，
 * 窄宽度时格式组收进「格式」弹层（nomo 的紧凑宽度分支）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Popup, { MenuDivider, MenuItem } from "./Popup";
import { ToolIcon } from "./ToolIcons";
import { t } from "../lib/i18n";
import type { EditorMode } from "./doc/Editor";
import type { ExportKind, ThemeMode } from "../types";

interface Props {
  mode: EditorMode;
  onMode(mode: EditorMode): void;
  onCommand(name: string): void;
  sidebarOpen: boolean;
  onToggleSidebar(): void;
  onSearch(): void;
  onOutline(): void;
  outlineOpen: boolean;
  widthPercent: number;
  onWidth(percent: number): void;
  theme: ThemeMode;
  onToggleTheme(): void;
  onExport(kind: ExportKind): void;
  readOnly: boolean;
  externalMode: boolean;
  onEnterEdit(): void;
  onUndo(): void;
  onRedo(): void;
  title: string;
  onTitleChange?(title: string): void;
}

interface ToolSpec {
  name: string;
  label: string;
  icon: string;
  group: number;
}

const TOOLS: ToolSpec[] = [
  { name: "h1", label: "H1", icon: "h1", group: 0 },
  { name: "h2", label: "H2", icon: "h2", group: 0 },
  { name: "h3", label: "H3", icon: "h3", group: 0 },
  { name: "bold", label: "B", icon: "bold", group: 1 },
  { name: "italic", label: "I", icon: "italic", group: 1 },
  { name: "strike", label: "S", icon: "strike", group: 1 },
  { name: "code", label: "</>", icon: "code", group: 1 },
  { name: "list", label: "•", icon: "list", group: 2 },
  { name: "task", label: "☑", icon: "task", group: 2 },
  { name: "quote", label: "❝", icon: "quote", group: 2 },
  { name: "codeblock", label: "{ }", icon: "codeblock", group: 3 },
  { name: "math", label: "∑", icon: "math", group: 3 },
  { name: "table", label: "▦", icon: "table", group: 3 },
  { name: "hr", label: "—", icon: "hr", group: 3 },
];

const MODES: { value: EditorMode; labelKey: string; icon: string }[] = [
  { value: "wysiwyg", labelKey: "toolbar.modeWysiwyg", icon: "M4 6h16M4 12h12M4 18h8" },
  { value: "split", labelKey: "toolbar.modeSplit", icon: "M12 3v18M5 6h6M5 12h6M5 18h6M15 6h4M15 12h4M15 18h4" },
  { value: "source", labelKey: "toolbar.modeSource", icon: "M9 8l-4 4 4 4M15 8l4 4-4 4" },
];

export default function Toolbar(props: Props) {
  const {
    mode,
    onMode,
    onCommand,
    sidebarOpen,
    onToggleSidebar,
    onSearch,
    onOutline,
    outlineOpen,
    widthPercent,
    onWidth,
    theme,
    onToggleTheme,
    onExport,
    readOnly,
    externalMode,
    onEnterEdit,
    onUndo,
    onRedo,
    title,
    onTitleChange,
  } = props;

  const ref = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [exportAnchor, setExportAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [widthAnchor, setWidthAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCompact(el.clientWidth < 720));
    observer.observe(el);
    setCompact(el.clientWidth < 720);
    return () => observer.disconnect();
  }, []);

  const modeIndex = useMemo(() => MODES.findIndex((item) => item.value === mode), [mode]);

  const openAt = (
    event: React.MouseEvent<HTMLButtonElement>,
    setter: (value: { x: number; y: number; width: number; height: number } | null) => void,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setter({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };

  return (
    <div className="toolbar" ref={ref}>
      <button
        className={"tool-btn" + (sidebarOpen ? " is-active" : "")}
        title={sidebarOpen ? t("editor.collapseSidebar") : t("editor.expandSidebar")}
        onClick={onToggleSidebar}
        disabled={externalMode}
      >
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <rect x="2.6" y="3.6" width="14.8" height="12.8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M7.6 3.6v12.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>

      <div className="mode-switch" role="tablist">
        <div className="mode-indicator" style={{ transform: `translateX(${modeIndex * 36}px)` }} />
        {MODES.map((item) => (
          <button
            key={item.value}
            role="tab"
            aria-selected={mode === item.value}
            className={"mode-btn" + (mode === item.value ? " is-active" : "")}
            title={t(item.labelKey as Parameters<typeof t>[0])}
            onClick={() => onMode(item.value)}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path d={item.icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      <button className="tool-btn" title={t("toolbar.undo")} onClick={onUndo} disabled={readOnly}>
        <ToolIcon name="undo" size={17} />
      </button>
      <button className="tool-btn" title={t("toolbar.redo")} onClick={onRedo} disabled={readOnly}>
        <ToolIcon name="redo" size={17} />
      </button>

      {compact ? (
        <button
          className="tool-btn is-wide"
          onClick={(event) => openAt(event, setAnchor)}
          title={t("toolbar.format")}
          disabled={readOnly}
        >
          <span className="tool-text">{t("toolbar.format")}</span>
        </button>
      ) : (
        <div className="tool-group">
          {TOOLS.map((tool, index) => (
            <span key={tool.name} className="tool-slot">
              {index > 0 && TOOLS[index - 1].group !== tool.group && <i className="tool-gap" />}
              <button
                className="tool-btn"
                title={t(("editor.block" + tool.name) as Parameters<typeof t>[0])}
                onClick={() => onCommand(tool.name === "codeblock" ? "code" : tool.name)}
                disabled={readOnly}
              >
                <ToolIcon name={tool.icon} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="toolbar-spacer" />

      <div className="doc-title" title={title}>
        {onTitleChange && !externalMode ? (
          <input
            value={title}
            placeholder={t("editor.noteTitlePlaceholder")}
            onChange={(event) => onTitleChange(event.target.value)}
            spellCheck={false}
          />
        ) : (
          <span>{title}</span>
        )}
      </div>

      <div className="toolbar-spacer" />

      <button
        className={"tool-btn is-wide" + (widthAnchor ? " is-active" : "")}
        onClick={(event) => openAt(event, setWidthAnchor)}
        title={t("toolbar.width")}
      >
        <span className="tool-text">{widthPercent}%</span>
      </button>
      <button className="tool-btn" title={t("toolbar.search")} onClick={onSearch}>
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <circle cx="8.8" cy="8.8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12.8 12.8L17.4 17.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <button
        className={"tool-btn" + (outlineOpen ? " is-active" : "")}
        title={t("toolbar.outline")}
        onClick={onOutline}
      >
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <path d="M3.4 5.2h13.2M3.4 10h9M3.4 14.8h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <button className="tool-btn" title={theme === "dark" ? t("status.toLight") : t("status.toDark")} onClick={onToggleTheme}>
        {theme === "dark" ? (
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 2.6v1.8M10 15.6v1.8M4.8 4.8l1.3 1.3M13.9 13.9l1.3 1.3M2.6 10h1.8M15.6 10h1.8M4.8 15.2l1.3-1.3M13.9 6.1l1.3-1.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <path d="M15.8 12.4A6.4 6.4 0 017.6 4.2a6.6 6.6 0 108.2 8.2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <button className="tool-btn" title={t("editor.exportNote")} onClick={(event) => openAt(event, setExportAnchor)}>
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <path d="M10 2.8v8.4M6.8 8l3.2 3.2L13.2 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.6 14.2v2a1.6 1.6 0 001.6 1.6h9.6a1.6 1.6 0 001.6-1.6v-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {externalMode && readOnly && (
        <button className="btn-primary" onClick={onEnterEdit}>
          {t("external.edit")}
        </button>
      )}

      {anchor && (
        <Popup anchor={anchor} onClose={() => setAnchor(null)} minWidth={186}>
          {TOOLS.map((tool) => (
            <MenuItem
              key={tool.name}
              label={t(("editor.block" + tool.name) as Parameters<typeof t>[0])}
              onClick={() => {
                setAnchor(null);
                onCommand(tool.name === "codeblock" ? "code" : tool.name);
              }}
            />
          ))}
        </Popup>
      )}

      {exportAnchor && (
        <Popup anchor={exportAnchor} align="end" onClose={() => setExportAnchor(null)} minWidth={186}>
          <MenuItem label={t("editor.exportMarkdown")} onClick={() => { setExportAnchor(null); onExport("md"); }} />
          <MenuItem label={t("editor.exportHtml")} onClick={() => { setExportAnchor(null); onExport("html"); }} />
          <MenuDivider />
          <MenuItem label={t("editor.exportImage")} onClick={() => { setExportAnchor(null); onExport("png"); }} />
          <MenuDivider />
          <MenuItem label={t("toolbar.printHint")} onClick={() => { setExportAnchor(null); onExport("html"); }} />
        </Popup>
      )}

      {widthAnchor && (
        <Popup anchor={widthAnchor} align="end" onClose={() => setWidthAnchor(null)} autoFocus={false}>
          <div className="width-panel">
            <span className="width-label">{t("toolbar.width")}</span>
            <input
              type="range"
              min={45}
              max={90}
              step={1}
              value={widthPercent}
              onChange={(event) => onWidth(Number(event.target.value))}
            />
            <span className="width-value">{widthPercent}%</span>
          </div>
        </Popup>
      )}
    </div>
  );
}