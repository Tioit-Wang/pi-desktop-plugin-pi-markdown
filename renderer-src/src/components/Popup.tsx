/**
 * 统一弹层（nomo: ui/popup.rs）。
 *
 * 规则照搬：与触发边界间隔 6px、到窗口边缘至少 8px；下方空间不足时向上翻转；
 * 高度不足时限制高度并允许内部滚动；入场 160ms 淡入 + 3px 位移，
 * 系统「减少动态效果」时只淡入不位移。
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface PopupAnchor {
  /** 视口坐标 */
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface Props {
  anchor: PopupAnchor;
  align?: "start" | "end";
  gap?: number;
  minWidth?: number;
  onClose(): void;
  children: ReactNode;
  className?: string;
  /** 打开时不自动 focus 首个可聚焦元素 */
  autoFocus?: boolean;
}

const MARGIN = 8;

export default function Popup({
  anchor,
  align = "start",
  gap = 6,
  minWidth,
  onClose,
  children,
  className,
  autoFocus = true,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const anchorTop = anchor.y;
    const anchorBottom = anchor.y + (anchor.height ?? 0);
    const spaceBelow = window.innerHeight - anchorBottom - gap - MARGIN;
    const spaceAbove = anchorTop - gap - MARGIN;
    const flip = rect.height > spaceBelow && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, minWidth ?? 0);
    let left = align === "end" ? anchor.x + (anchor.width ?? 0) - width : anchor.x;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));
    const top = flip ? Math.max(MARGIN, anchorTop - gap - rect.height) : anchorBottom + gap;
    const maxHeight = Math.max(120, flip ? spaceAbove : spaceBelow);
    setPlaced({ left, top, maxHeight });
  }, [anchor, align, gap, minWidth]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      const focusable = ref.current.querySelector<HTMLElement>(
        "input, button, [tabindex]:not([tabindex='-1'])",
      );
      focusable?.focus({ preventScroll: true });
    }
  }, [autoFocus]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={"popover " + (className ?? "")}
      style={{
        left: placed?.left ?? anchor.x,
        top: placed?.top ?? anchor.y + (anchor.height ?? 0) + gap,
        maxHeight: placed?.maxHeight,
        minWidth,
        visibility: placed ? "visible" : "hidden",
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  hint,
  danger,
  active,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  active?: boolean;
  onClick(): void;
}) {
  return (
    <button
      className={
        "menu-item" + (danger ? " is-danger" : "") + (active ? " is-active" : "")
      }
      onClick={onClick}
    >
      {icon && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{label}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </button>
  );
}

export function MenuDivider() {
  return <div className="menu-divider" />;
}