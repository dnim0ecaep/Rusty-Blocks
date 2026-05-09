import { useState } from "react";
import { FileManagerDialog, type FileManagerTab } from "./FileManagerDialog";

export function WelcomeScreen() {
  const [openTab, setOpenTab] = useState<FileManagerTab | null>(null);

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <h1 className="welcome-title">Rustyblocks Studio</h1>
        <p className="welcome-subtitle">Create or open a project to get started.</p>
        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-btn welcome-btn-primary"
            onClick={() => setOpenTab("new")}
          >
            New Project
          </button>
          <button
            type="button"
            className="welcome-btn"
            onClick={() => setOpenTab("open")}
          >
            Open Project
          </button>
        </div>
      </div>
      {openTab ? (
        <FileManagerDialog initialTab={openTab} onClose={() => setOpenTab(null)} />
      ) : null}
    </div>
  );
}
