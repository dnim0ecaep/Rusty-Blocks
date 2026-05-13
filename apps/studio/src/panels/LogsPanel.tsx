import { useEffect, useRef } from "react";
import { useProjectStore } from "../store/projectStore";

export function LogsPanel() {
  const logs = useProjectStore((state) => state.logs);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Track whether the user is "at the bottom" so a streaming build log
  // doesn't yank them away from a stack trace they're trying to read.
  // We snapshot the value BEFORE the DOM grows so the next layout
  // effect sees the pre-update scroll position.
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    // 16-px slack so floating-point scroll positions still count as
    // "bottom" — without it, hi-DPI displays drift a sub-pixel and the
    // auto-scroll never re-engages once the user scrolls down again.
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 16;
  };

  return (
    <div className="logs-panel" ref={scrollerRef} onScroll={onScroll}>
      {logs.length === 0 ? <p className="muted">No logs yet.</p> : null}
      {logs.map((line, index) => (
        <p key={`${index}-${line}`}>{line}</p>
      ))}
    </div>
  );
}
