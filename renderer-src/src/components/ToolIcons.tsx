/**
 * 工具栏图标集（14 条块级命令），统一 18×18 视框、1.6 描边，
 * 与 nomo 工具栏「图标 17px + 32×28 按钮」的观感一致。
 */
import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  h1: <path d="M4.5 14V4M11.5 4v10M4.5 9h7M14.5 6.4l1.6-1.1V14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  h2: <path d="M3.5 14V4M9 4v10M3.5 9h5.5M12.4 6.2a1.7 1.7 0 013.1.9c0 1.6-3 2.2-3 4.4h3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  h3: <path d="M3.5 14V4M9 4v10M3.5 9h5.5M12.2 5.2h3.1l-1.8 2.4a1.9 1.9 0 11-1.3 3.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  bold: <path d="M6 4.5h4.2a2.8 2.8 0 010 5.6H6zM6 10.1h4.8a2.9 2.9 0 010 5.8H6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
  italic: <path d="M8.4 4.5h4M6 15.5h4M11 4.5L9 15.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
  strike: <path d="M4 10h12M7.6 6.6A2.6 2.6 0 0110 5.2c1.7 0 2.8.9 2.8 2.1M12.4 12.4c0 1.4-1.1 2.4-2.7 2.4-1.6 0-2.7-.8-3-2.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  code: <path d="M7.4 6.2L3.6 10l3.8 3.8M12.6 6.2L16.4 10l-3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  list: <path d="M7.6 6h8.4M7.6 10h8.4M7.6 14h8.4M4.2 6h.01M4.2 10h.01M4.2 14h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
  task: <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3.6" y="4.2" width="5.4" height="5.4" rx="1.4" /><path d="M4.9 6.9l1.3 1.3 2-2" strokeWidth="1.4" /><path d="M11.4 6.6h5M4 14.4h12" /></g>,
  quote: <path d="M6.4 5.6c-1.6 0-2.8 1.3-2.8 2.9S4.8 11.4 6.4 11.4c.3 0 .6 0 .8-.1-.5 1.5-1.6 2.4-3 2.9M14.4 5.6c-1.6 0-2.8 1.3-2.8 2.9s1.2 2.9 2.8 2.9c.3 0 .6 0 .8-.1-.5 1.5-1.6 2.4-3 2.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  codeblock: <g fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4.4" width="14" height="11.2" rx="2" /><path d="M6.6 8.2L5 10l1.6 1.8M13.4 8.2L15 10l-1.6 1.8" strokeLinecap="round" strokeLinejoin="round" /></g>,
  math: <path d="M4.4 14.6l4-5-4-5h7.2M12.4 7.6v7M10.4 11.1h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  table: <g fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4.4" width="14" height="11.2" rx="1.8" /><path d="M3 8.4h14M3 12h14M8.6 8.4v7.2M13 8.4v7.2" /></g>,
  hr: <path d="M3.4 10h13.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  undo: <path d="M7 5L3.5 8.5 7 12M3.8 8.5h7.4a4.3 4.3 0 010 8.6H8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  redo: <path d="M13 5l3.5 3.5L13 12M16.2 8.5H8.8a4.3 4.3 0 000 8.6H12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
};

export function ToolIcon({ name, size = 18 }: { name: string; size?: number }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      {body}
    </svg>
  );
}

export const TOOL_ICON_NAMES = Object.keys(PATHS);