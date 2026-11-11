/**
 * 行内 token → DOM。每个片段带 `data-o`（该片段首字符在块原文中的绝对偏移），
 * 于是「点击渲染块 → 换算源码光标」不需要额外布局信息。
 */
import { memo, type ReactNode } from "react";
import type { InlineToken } from "../../core/md/inline";
import { inlineText } from "../../core/md/inline";
import { mathHtml } from "../../core/md/katex";

interface Props {
  tokens: InlineToken[];
  /** 块内正文起点偏移（token.o 是相对正文的） */
  base: number;
}

function firstCharOffset(token: InlineToken): number {
  if (token.t === "text" || token.t === "code" || token.t === "math" || token.t === "html") {
    const inner = (token.text ?? "").length;
    return token.o + Math.max(0, Math.round((token.l - inner) / 2));
  }
  return token.o;
}

function renderTokens(tokens: InlineToken[], base: number): ReactNode[] {
  const out: ReactNode[] = [];
  let key = 0;
  for (const token of tokens) {
    const o = base + firstCharOffset(token);
    switch (token.t) {
      case "text":
        out.push(
          <span key={key++} data-o={o}>
            {token.text}
          </span>,
        );
        break;
      case "strong":
        out.push(
          <strong key={key++}>
            {renderTokens(token.children ?? [], base)}
          </strong>,
        );
        break;
      case "em":
        out.push(<em key={key++}>{renderTokens(token.children ?? [], base)}</em>);
        break;
      case "del":
        out.push(<del key={key++}>{renderTokens(token.children ?? [], base)}</del>);
        break;
      case "code":
        out.push(
          <code key={key++} data-o={o} className="inline-code">
            {token.text}
          </code>,
        );
        break;
      case "math":
        out.push(
          <span
            key={key++}
            data-o={o}
            className="inline-math"
            dangerouslySetInnerHTML={{ __html: mathHtml(token.text ?? "", false) }}
          />,
        );
        break;
      case "link":
        out.push(
          <a
            key={key++}
            className="inline-link"
            href={token.href}
            title={token.title || token.href}
            onClick={(event) => event.preventDefault()}
            data-href={token.href}
          >
            {renderTokens(token.children ?? [], base)}
          </a>,
        );
        break;
      case "image":
        out.push(
          <img
            key={key++}
            data-o={o}
            className="inline-img"
            src={token.href}
            alt={token.text ?? ""}
            loading="lazy"
            decoding="async"
          />,
        );
        break;
      case "br":
        out.push(<br key={key++} />);
        break;
      case "html":
        out.push(<span key={key++} data-o={o}>{token.text}</span>);
        break;
      default:
        break;
    }
  }
  return out;
}

function InlineImpl({ tokens, base }: Props) {
  return <>{renderTokens(tokens, base)}</>;
}

export const Inline = memo(InlineImpl);

/** 渲染块内纯文本（导出、快照用） */
export function inlineToText(tokens: InlineToken[]): string {
  return inlineText(tokens);
}