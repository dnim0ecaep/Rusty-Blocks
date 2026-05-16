import { useEffect, useRef } from "react";
import { useProjectStore } from "../store/projectStore";

export function LogsPanel() {
  const logs = useProjectStore((state) => state.logs);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="logs-panel" ref={scrollerRef}>
      {logs.length === 0 ? <p className="muted">No logs yet.</p> : null}
      {logs.map((line, index) => (
        <p key={`${index}-${line}`}>{line}</p>
      ))}
    </div>
  );
}
