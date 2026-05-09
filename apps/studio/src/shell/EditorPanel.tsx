import { CenterWorkspace } from "./CenterWorkspace";
import {
  BackdropPicker,
  CostumePicker,
  SoundPicker,
} from "./StagePanel";
import { useStageStore } from "../store/stageStore";
import { useUiStore } from "../store/uiStore";

/**
 * Scratch/TurboWarp-style tabbed editor.
 *
 * The active sprite (or the stage) determines what's editable, and the
 * tab determines *which aspect* — scripts, costumes/backdrops, or
 * sounds. The Code tab keeps the existing Blockly workspace, which
 * already swaps content based on `selectedSpriteId` (per-sprite scripts
 * vs. project-level/stage scripts).
 */
export function EditorPanel() {
  const editorTab = useUiStore((s) => s.editorTab);
  const setEditorTab = useUiStore((s) => s.setEditorTab);
  const selectedSpriteId = useStageStore((s) => s.selectedSpriteId);
  const sprites = useStageStore((s) => s.sprites);
  const selectedSprite = selectedSpriteId
    ? sprites.find((s) => s.id === selectedSpriteId)
    : null;
  const isStage = !selectedSpriteId;

  const tabs: Array<{ id: typeof editorTab; label: string }> = [
    { id: "code", label: "Code" },
    { id: "costumes", label: isStage ? "Backdrops" : "Costumes" },
    { id: "sounds", label: "Sounds" },
  ];

  return (
    <section className="editor-panel" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div
        className="editor-tabs"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color, #cdd6e2)",
          background: "var(--panel-bg, #f5f7fb)",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setEditorTab(t.id)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderBottom:
                t.id === editorTab
                  ? "2px solid #1967d2"
                  : "2px solid transparent",
              background: "transparent",
              color: t.id === editorTab ? "#1967d2" : "inherit",
              fontWeight: t.id === editorTab ? 600 : 400,
              cursor: "pointer",
              fontSize: 13,
              font: "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1, padding: "8px 12px", textAlign: "right", fontSize: 11, color: "#5b6371" }}>
          {isStage ? "Stage" : selectedSprite?.name}
        </div>
      </div>

      <div className="editor-tab-content" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {editorTab === "code" ? (
          <CenterWorkspace />
        ) : editorTab === "costumes" ? (
          isStage ? (
            <div style={{ padding: 12, overflow: "auto" }}>
              <BackdropPicker />
            </div>
          ) : selectedSprite ? (
            <div style={{ padding: 12, overflow: "auto" }}>
              <CostumePicker sprite={selectedSprite} />
            </div>
          ) : null
        ) : editorTab === "sounds" ? (
          isStage ? (
            <div style={{ padding: 24, color: "#5b6371", fontSize: 13 }}>
              Stage sounds aren't editable yet — pick a sprite to add sounds to it.
            </div>
          ) : selectedSprite ? (
            <div style={{ padding: 12, overflow: "auto" }}>
              <SoundPicker sprite={selectedSprite} />
            </div>
          ) : null
        ) : null}
      </div>
    </section>
  );
}
