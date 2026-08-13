import { useEffect, useRef } from "react";

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
      ? "新建笔记"
      : modal.kind === "new-folder"
        ? "新建文件夹"
        : modal.kind === "rename"
          ? "重命名"
          : "删除确认";
  const label =
    modal.kind === "new-note"
      ? "笔记标题"
      : modal.kind === "new-folder"
        ? "文件夹名称"
        : modal.kind === "rename"
          ? "新名称"
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
            确定要删除
            <span className="mx-1 font-medium text-ink">{modal.name}</span>
            {modal.childCount > 0 ? `（含 ${modal.childCount} 个子项）` : ""}
            吗？此操作不可撤销。
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
              modal.kind === "new-note" ? "输入笔记标题…" : "输入名称…"
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
            取消
          </button>
          {isInput ? (
            <button
              className="bg-accent px-3.5 py-1.5 text-xs text-black hover:bg-accent2"
              onClick={() => onSubmit(inputRef.current?.value)}
            >
              确定
            </button>
          ) : (
            <button
              className="bg-danger px-3.5 py-1.5 text-xs text-white hover:opacity-90"
              onClick={() => onSubmit()}
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
