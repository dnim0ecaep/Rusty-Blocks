import { ChangeEvent } from "react";

import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

export function RightInspector() {
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  const diagnostics = useProjectStore((state) => state.diagnostics);
  const selectedBlockId = useUiStore((state) => state.selectedBlockId);

  const selectedNode = project?.normalized_graph.nodes.find((node) => node.id === selectedBlockId);

  const updateMeta = (field: "app_name" | "package_id" | "version") => (event: ChangeEvent<HTMLInputElement>) => {
    if (!project) {
      return;
    }

    setProject({
      ...project,
      project: {
        ...project.project,
        [field]: event.target.value,
        updated_at: new Date().toISOString()
      }
    });
  };

  return (
    <aside className="right-inspector">
      <h3>Inspector</h3>
      {project ? (
        <>
          <label>
            App Name
            <input value={project.project.app_name} onChange={updateMeta("app_name")} />
          </label>
          <label>
            Package ID
            <input value={project.project.package_id} onChange={updateMeta("package_id")} />
          </label>
          <label>
            Version
            <input value={project.project.version} onChange={updateMeta("version")} />
          </label>
        </>
      ) : (
        <p className="muted">Create or open a project.</p>
      )}

      <section>
        <h4>Selected Block</h4>
        {selectedNode ? (
          <pre>{JSON.stringify(selectedNode, null, 2)}</pre>
        ) : (
          <p className="muted">Select a block to inspect type and properties.</p>
        )}
      </section>

      <section>
        <h4>Validation</h4>
        {diagnostics.length === 0 ? (
          <p className="muted">No current diagnostics.</p>
        ) : (
          diagnostics.slice(0, 6).map((diag, index) => (
            <p key={`${diag.code}-${index}`} className={`diag-inline ${diag.severity}`}>
              {diag.code}: {diag.message}
            </p>
          ))
        )}
      </section>
    </aside>
  );
}
