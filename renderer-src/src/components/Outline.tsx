import type { OutlineItem } from "../types";
import { t } from "../lib/i18n";

interface Props {
  items: OutlineItem[];
  activeIndex: number;
  onNavigate(index: number): void;
}

export default function Outline({ items, activeIndex, onNavigate }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-faint">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 opacity-60"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <p>{t("outline.empty")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-px py-1">
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => onNavigate(i)}
          className={`flex items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors ${
            activeIndex === i
              ? "bg-sel font-medium text-onsel"
              : "text-muted hover:bg-panel2 hover:text-ink"
          }`}
          style={{ paddingLeft: `${(item.level - 1) * 14 + 8}px` }}
        >
          <span className="shrink-0 font-mono text-[10px] text-faint">
            {"#".repeat(item.level)}
          </span>
          <span className="truncate">{item.text}</span>
        </button>
      ))}
    </div>
  );
}
