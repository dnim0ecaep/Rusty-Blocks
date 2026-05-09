import { useProjectStore } from "../store/projectStore";

export function DiagnosticsPanel() {
  const diagnostics = useProjectStore((state) => state.diagnostics);

  if (diagnostics.length === 0) {
    return <p className="muted">No diagnostics. Run Validate to confirm.</p>;
  }

  return (
    <div className="diagnostics-list">
      {diagnostics.map((diagnostic, index) => (
        <article key={`${diagnostic.code}-${index}`} className={`diag-card ${diagnostic.severity}`}>
          <header>
            <strong>{diagnostic.code}</strong>
            <span>{diagnostic.severity.toUpperCase()}</span>
          </header>
          <p>{diagnostic.message}</p>
          {diagnostic.hint ? <small>{diagnostic.hint}</small> : null}
        </article>
      ))}
    </div>
  );
}
