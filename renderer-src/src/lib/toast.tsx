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
      setItems((prev) => [...prev.slice(-3), { id, msg, kind: kind ?? "info" }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 3200);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  return (
    <div className="toast-host">
      {items.map((item) => (
        <div key={item.id} className={"toast" + (item.kind === "error" ? " is-error" : "")}>
          {item.msg}
        </div>
      ))}
    </div>
  );
}