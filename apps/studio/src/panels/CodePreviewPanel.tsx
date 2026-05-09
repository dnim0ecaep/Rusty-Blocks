import { useMemo, useState } from "react";

import { useProjectStore } from "../store/projectStore";

export function CodePreviewPanel() {
  const files = useProjectStore((state) => state.codePreview);
  const fileKeys = useMemo(() => Object.keys(files), [files]);
  const [selectedFile, setSelectedFile] = useState<string>("src/main.rs");

  const activeFile = fileKeys.includes(selectedFile) ? selectedFile : fileKeys[0];

  return (
    <div className="panel-grid-two">
      <div className="panel-list">
        {fileKeys.length === 0 ? <p className="muted">Run Generate Source to view code.</p> : null}
        {fileKeys.map((file) => (
          <button
            key={file}
            className={file === activeFile ? "panel-list-item active" : "panel-list-item"}
            onClick={() => setSelectedFile(file)}
            type="button"
          >
            {file}
          </button>
        ))}
      </div>
      <pre className="panel-code">{activeFile ? files[activeFile] : ""}</pre>
    </div>
  );
}
