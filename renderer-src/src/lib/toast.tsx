import { useEffect, useRef, useState } from "react";

interface ToastItem {
  id: number;
  msg: string;
  kind: "info" | "error";
}

let pushToast: ((msg: string, kind?: "info" | "error") => void) | null = null;

export function toast(msg: string, kind: "info" | "error" = "info"): void {
  pushToast?.(msg, kind);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  useEffect(() => {
    pushToast = (msg: string, kind?: "info" | "error") => {
      const id = idRef.current++;
      setItems((prev) => [
        ...prev.slice(-3),
        { id, msg, kind: kind ?? "info" },
      ]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[1000] flex flex-col items-end gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`animate-[toastIn_0.18s_ease-out] border px-4 py-2 text-sm ${
            t.kind === "error"
              ? "border-danger bg-panel2 text-danger"
              : "border-edge2 bg-panel2 text-ink"
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
