import { useMemo } from "react";

import { useProjectStore } from "../store/projectStore";

export function FileTreePanel() {
  const files = useProjectStore((state) => state.codePreview);
  const tree = useMemo(() => Object.keys(files).sort(), [files]);

  return (
    <div className="file-tree">
      {tree.length === 0 ? <p className="muted">No generated files available.</p> : null}
      {tree.map((file) => (
        <p key={file}>{file}</p>
      ))}
    </div>
  );
}
