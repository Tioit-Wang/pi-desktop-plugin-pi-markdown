/**
 * 悬浮状态栏（nomo: ui/workspace/status.rs）
 * 右下角 gap8、每个触发器 h28/r8/mono 13，hover 时边框转 accent 并上浮 1px。
 */
import { useState } from "react";
import Popup, { MenuItem } from "./Popup";
import type { SaveState } from "../types";
import { t } from "../lib/i18n";

interface Props {
  save: SaveState;
  words: number;
  chars: number;
  lines: number;
  readingMinutes: number;
  zoom: number;
  onZoom(zoom: number): void;
  dataDir: string | null;
  externalPath: string | null;
  mode: "wysiwyg" | "split" | "source";
}

type Anchor = { x: number; y: number; width: number; height: number } | null;

export default function StatusBar({
  save,
  words,
  chars,
  lines,
  readingMinutes,
  zoom,
  onZoom,
  dataDir,
  externalPath,
  mode,
}: Props) {
  const [saveAnchor, setSaveAnchor] = useState<Anchor>(null);
  const [zoomAnchor, setZoomAnchor] = useState<Anchor>(null);

  const open = (
    event: React.MouseEvent<HTMLButtonElement>,
    setter: (value: Anchor) => void,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setter({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };

  const saveLabel =
    save.status === "saving"
      ? t("status.saving")
      : save.status === "error"
        ? t("status.saveFailed")
        : save.at
          ? t("status.savedAt", { time: new Date(save.at).toLocaleTimeString() })
          : t("status.ready");

  return (
    <div className="status-bar">
      <button
        className={"status-trigger" + (save.status === "error" ? " is-danger" : "")}
        onClick={(event) => open(event, setSaveAnchor)}
        title={saveLabel}
      >
        <span className={"status-dot is-" + save.status} />
        <span className="status-text">{saveLabel}</span>
      </button>
      <button className="status-trigger" title={t("status.words")}>
        {words.toLocaleString()} <span className="status-unit">{t("status.unitWords")}</span>
      </button>
      <button className="status-trigger" title={t("status.chars", { count: chars })}>
        {lines.toLocaleString()} <span className="status-unit">{t("status.unitLines")}</span>
      </button>
      <button className="status-trigger" title={t("status.reading")}>
        {readingMinutes} <span className="status-unit">{t("status.unitMinutes")}</span>
      </button>
      <button
        className={"status-trigger" + (zoomAnchor ? " is-active" : "")}
        onClick={(event) => open(event, setZoomAnchor)}
        title={t("status.zoom")}
      >
        {Math.round(zoom * 100)}%
      </button>

      {saveAnchor && (
        <Popup anchor={saveAnchor} align="end" onClose={() => setSaveAnchor(null)} minWidth={208}>
          <div className="popover-title">{t("status.detailTitle")}</div>
          <div className="status-detail">
            <div>
              <span>{t("status.mode")}</span>
              <b>{t(mode === "wysiwyg" ? "toolbar.modeWysiwyg" : mode === "split" ? "toolbar.modeSplit" : "toolbar.modeSource")}</b>
            </div>
            <div>
              <span>{t("status.words")}</span>
              <b>{words.toLocaleString()}</b>
            </div>
            <div>
              <span>{t("status.charsShort")}</span>
              <b>{chars.toLocaleString()}</b>
            </div>
            <div>
              <span>{t("status.location")}</span>
              <b title={externalPath ?? dataDir ?? "-"}>{externalPath ?? dataDir ?? t("status.browserMode")}</b>
            </div>
          </div>
        </Popup>
      )}

      {zoomAnchor && (
        <Popup anchor={zoomAnchor} align="end" onClose={() => setZoomAnchor(null)} minWidth={196}>
          <div className="popover-title">{t("status.zoom")}</div>
          <MenuItem label={t("status.zoomReset")} hint="100%" onClick={() => { onZoom(1); setZoomAnchor(null); }} />
          <MenuItem label="120%" onClick={() => { onZoom(1.2); setZoomAnchor(null); }} />
          <MenuItem label="140%" onClick={() => { onZoom(1.4); setZoomAnchor(null); }} />
          <MenuItem label="160%" onClick={() => { onZoom(1.6); setZoomAnchor(null); }} />
          <MenuItem label="90%" onClick={() => { onZoom(0.9); setZoomAnchor(null); }} />
          <div className="zoom-slider">
            <input
              type="range"
              min={80}
              max={160}
              step={5}
              value={Math.round(zoom * 100)}
              onChange={(event) => onZoom(Number(event.target.value) / 100)}
            />
          </div>
        </Popup>
      )}
    </div>
  );
}