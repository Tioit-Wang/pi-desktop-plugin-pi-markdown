import { useEffect, useRef } from "react";
import { t } from "../lib/i18n";

export type ModalState =
  | { kind: "new-note"; parentId: string | null }
  | { kind: "new-folder"; parentId: string | null }
  | { kind: "rename"; id: string; current: string }
  | { kind: "delete"; id: string; name: string; childCount: number };

interface Props {
  modal: ModalState | null;
  onClose(): void;
  onSubmit(value?: string): void;
}

export default function Modal({ modal, onClose, onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modal && modal.kind !== "delete") inputRef.current?.focus();
  }, [modal]);

  if (!modal) return null;

  const isInput = modal.kind !== "delete";
  const title =
    modal.kind === "new-note"
      ? t("modal.newNoteTitle")
      : modal.kind === "new-folder"
        ? t("modal.newFolderTitle")
        : modal.kind === "rename"
          ? t("modal.renameTitle")
          : t("modal.deleteTitle");
  const label =
    modal.kind === "new-note"
      ? t("modal.noteTitleLabel")
      : modal.kind === "new-folder"
        ? t("modal.folderNameLabel")
        : modal.kind === "rename"
          ? t("modal.newNameLabel")
          : "";
  const defaultValue =
    modal.kind === "rename"
      ? modal.current
      : modal.kind === "new-note"
        ? ""
        : modal.kind === "new-folder"
          ? ""
          : "";

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[360px] border border-edge2 bg-panel2 p-5">
        <h3 className="mb-1 text-sm font-semibold text-ink">{title}</h3>
        {modal.kind === "delete" ? (
          <p className="text-xs leading-5 text-muted">
            {modal.childCount > 0
              ? t("modal.deleteConfirm", {
                  name: modal.name,
                  count: modal.childCount,
                })
              : t("modal.deleteConfirmSimple", { name: modal.name })}
          </p>
        ) : (
          <label className="mb-1 block text-xs text-muted">{label}</label>
        )}

        {isInput && (
          <input
            ref={inputRef}
            className="mt-1 w-full border border-edge2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            defaultValue={defaultValue}
            placeholder={
              modal.kind === "new-note"
                ? t("modal.noteTitlePlaceholder")
                : t("modal.namePlaceholder")
            }
            onKeyDown={(e) => {
              if (e.key === "Enter")
                onSubmit((e.target as HTMLInputElement).value);
              if (e.key === "Escape") onClose();
            }}
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="border border-edge2 px-3.5 py-1.5 text-xs text-muted hover:bg-panel hover:text-ink"
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          {isInput ? (
            <button
              className="bg-accent px-3.5 py-1.5 text-xs text-onaccent hover:bg-accent2"
              onClick={() => onSubmit(inputRef.current?.value)}
            >
              {t("common.confirm")}
            </button>
          ) : (
            <button
              className="bg-danger px-3.5 py-1.5 text-xs text-white hover:opacity-90"
              onClick={() => onSubmit()}
            >
              {t("common.delete")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
