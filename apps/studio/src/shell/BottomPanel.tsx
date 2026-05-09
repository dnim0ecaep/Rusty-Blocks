import { CodePreviewPanel } from "../panels/CodePreviewPanel";
import { DiagnosticsPanel } from "../panels/DiagnosticsPanel";
import { FileTreePanel } from "../panels/FileTreePanel";
import { IrViewPanel } from "../panels/IrViewPanel";
import { LogsPanel } from "../panels/LogsPanel";
import { useUiStore } from "../store/uiStore";

const tabs: Array<{ id: "code" | "diagnostics" | "logs" | "files" | "ir"; label: string }> = [
  { id: "code", label: "Code" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "logs", label: "Logs" },
  { id: "files", label: "File Tree" },
  { id: "ir", label: "IR" }
];

export function BottomPanel() {
  const activeBottomTab = useUiStore((state) => state.activeBottomTab);
  const setBottomTab = useUiStore((state) => state.setBottomTab);

  return (
    <section className="bottom-panel">
      <nav className="bottom-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeBottomTab === tab.id ? "active" : ""}
            onClick={() => setBottomTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="bottom-content">
        {activeBottomTab === "code" ? <CodePreviewPanel /> : null}
        {activeBottomTab === "diagnostics" ? <DiagnosticsPanel /> : null}
        {activeBottomTab === "logs" ? <LogsPanel /> : null}
        {activeBottomTab === "files" ? <FileTreePanel /> : null}
        {activeBottomTab === "ir" ? <IrViewPanel /> : null}
      </div>
    </section>
  );
}
