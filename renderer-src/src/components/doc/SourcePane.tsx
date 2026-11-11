/**
 * 源码模式（nomo: source_view 的 Web 版）：整篇原文直接编辑。
 * 与富文本共用同一会话，切换模式不丢正文；输入用 160 ms 防抖回灌块模型。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { debounceTrailing } from "../../core/perf/scheduler";
import type { DocSession } from "../../core/doc/session";

interface Props {
  session: DocSession;
  readOnly: boolean;
  onDirty(): void;
}

export default function SourcePane({ session, readOnly, onDirty }: Props) {
  const [text, setText] = useState(() => session.editableSource);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const sessionId = session.id;

  const apply = useMemo(
    () =>
      debounceTrailing(
        (value: string) => {
          session.replaceAll(value);
          onDirty();
        },
        160,
        400,
      ),
    [session, onDirty],
  );

  useEffect(() => {
    setText(session.editableSource);
    // 仅在换文档时重新载入，避免与输入互相覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        apply.flush();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      apply.flush();
    };
  }, [apply]);

  return (
    <div className="source-pane">
      <textarea
        ref={ref}
        value={text}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          apply(event.target.value);
        }}
        onBlur={() => apply.flush()}
      />
    </div>
  );
}