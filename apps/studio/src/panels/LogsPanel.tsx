import { useProjectStore } from "../store/projectStore";

export function LogsPanel() {
  const logs = useProjectStore((state) => state.logs);

  return (
    <div className="logs-panel">
      {logs.length === 0 ? <p className="muted">No logs yet.</p> : null}
      {logs.map((line, index) => (
        <p key={`${index}-${line}`}>{line}</p>
      ))}
    </div>
  );
}
