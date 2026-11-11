/**
 * 对话框（nomo: ui/dialogs.rs）
 * 卡片 r12 + 1px 边框 + 20/60 浮动阴影，入场 160ms 淡入 + 6px 上移。
 */
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
  const initial = useRef("");

  useEffect(() => {
    if (!modal) return;
    initial.current = modal.kind === "rename" ? modal.current : "";
    if (modal.kind !== "delete") {
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
    }
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
        : t("modal.newNameLabel");

  const submit = () => {
    if (modal.kind === "delete") {
      onSubmit();
      return;
    }
    const value = inputRef.current?.value ?? "";
    onSubmit(value.trim() || undefined);
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter" && isInput) submit();
        }}
      >
        <div className="dialog-title">{title}</div>
        {isInput ? (
          <label className="dialog-field">
            <span>{label}</span>
            <input ref={inputRef} defaultValue={initial.current} placeholder={t("modal.namePlaceholder")} spellCheck={false} />
          </label>
        ) : (
          <p className="dialog-body">
            {modal.childCount > 0
              ? t("modal.deleteConfirm", { name: modal.name, count: modal.childCount })
              : t("modal.deleteConfirmSimple", { name: modal.name })}
          </p>
        )}
        <div className="dialog-actions">
          <button className="btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn-primary" autoFocus={!isInput} onClick={submit}>
            {modal.kind === "delete" ? t("common.delete") : t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}