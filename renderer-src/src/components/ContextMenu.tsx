export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  onClick(): void;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

interface Props {
  menu: MenuState | null;
  onClose(): void;
}

export default function ContextMenu({ menu, onClose }: Props) {
  if (!menu) return null;
  const style: React.CSSProperties = {
    left: Math.min(menu.x, window.innerWidth - 220),
    top: Math.min(menu.y, window.innerHeight - menu.items.length * 32 - 16),
  };
  return (
    <>
      <div
        className="fixed inset-0 z-[800]"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-[801] w-[200px] border border-edge2 bg-panel2 py-1"
        style={style}
        onContextMenu={(e) => e.preventDefault()}
      >
        {menu.items.map((item, i) => (
          <button
            key={i}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-panel ${
              item.danger ? "text-danger" : "text-ink"
            }`}
            onClick={() => {
              onClose();
              item.onClick();
            }}
          >
            {item.icon && (
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 shrink-0 opacity-80"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d={item.icon} />
              </svg>
            )}
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
