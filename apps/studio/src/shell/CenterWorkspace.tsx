import { useEffect, useRef } from "react";
import * as Blockly from "blockly";

import { registerWarpforgeBlocks } from "../blocks/blockDefinitions";
import { registerRustBlocks } from "../blocks/rustBlockDefinitions";
import { registerAllCustomBlocks, registerCustomBlock } from "../blocks/registerCustomBlocks";
import { registerWarpforgeMutators } from "../blocks/blockMutators";
import { registerBlockExplainMenu } from "../blocks/blockContextMenu";
import { setVibeWorkspace } from "../blocks/vibeWorkspace";
import { buildToolboxXml } from "../blocks/toolboxBuilder";
import {
  applyCategoryColorsToWorkspace,
  installCategoryColorOverrides,
} from "../blocks/blockColorOverrides";
import { warpforgeTheme, warpforgeDarkTheme } from "../blocks/blocklyTheme";
import { workspaceToNormalizedGraph } from "../blocks/workspaceAdapter";
import { useProjectStore } from "../store/projectStore";
import { useStageStore } from "../store/stageStore";
import { useUiStore } from "../store/uiStore";
import { useBlockOrgStore } from "../store/blockOrgStore";
import { useCustomBlocksStore } from "../store/customBlocksStore";
import { BlockOrganizerDialog } from "./BlockOrganizerDialog";

/**
 * Active edit target for the on-screen Blockly workspace.
 *
 * When `kind === "project"` the workspace is editing the app-level codegen
 * graph (bound to `project.workspace_state.blockly_xml`). When
 * `kind === "sprite"` it's editing that sprite's runtime scripts (bound
 * to `sprite.scripts_xml`). The change listener and the swap effect both
 * consult a ref holding this so we never persist sprite scripts onto the
 * project graph or vice versa.
 */
type EditTarget = { kind: "project" } | { kind: "sprite"; id: string };

export function CenterWorkspace() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const hydratingRef = useRef(false);
  const editTargetRef = useRef<EditTarget>({ kind: "project" });
  const project = useProjectStore((state) => state.project);
  const selectedSpriteId = useStageStore((state) => state.selectedSpriteId);
  const { showBlockOrganizer, toggleBlockOrganizer, darkMode } = useUiStore();
  const assignments = useBlockOrgStore((state) => state.assignments);
  const customCategories = useBlockOrgStore((state) => state.customCategories);
  const categoryRenames = useBlockOrgStore((state) => state.categoryRenames);
  const categoryOrder = useBlockOrgStore((state) => state.categoryOrder);
  const categoryColors = useBlockOrgStore((state) => state.categoryColors);
  const customBlocks = useCustomBlocksStore((state) => state.blocks);

  useEffect(() => {
    if (!containerRef.current || workspaceRef.current) {
      return;
    }

    registerWarpforgeBlocks();
    registerRustBlocks();
    registerAllCustomBlocks(useCustomBlocksStore.getState().blocks);
    registerWarpforgeMutators();
    registerBlockExplainMenu();
    // Patch every registered block's init() so it applies the user's
    // category color override after running the original init. Must come
    // after every register* call so we cover every block type.
    installCategoryColorOverrides();

    const isDark = useUiStore.getState().darkMode;
    const workspace = Blockly.inject(containerRef.current, {
      toolbox: buildToolboxXml(
        useBlockOrgStore.getState().assignments,
        useBlockOrgStore.getState().customCategories,
        useBlockOrgStore.getState().categoryRenames,
        useBlockOrgStore.getState().categoryOrder,
        useBlockOrgStore.getState().categoryColors
      ),
      theme: isDark ? warpforgeDarkTheme : warpforgeTheme,
      renderer: "zelos",
      move: {
        wheel: true,
        drag: true,
        scrollbars: true
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1,
        maxScale: 2,
        minScale: 0.3,
        scaleSpeed: 1.1,
        pinch: true
      },
      comments: true,
      trashcan: true,
      grid: {
        spacing: 24,
        length: 3,
        colour: isDark ? "#2e3a52" : "#d7e2f3",
        snap: true
      }
    });

    workspaceRef.current = workspace;
    setVibeWorkspace(workspace);

    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(workspace);
    });
    resizeObserver.observe(containerRef.current);

    workspace.addChangeListener((event) => {
      if (hydratingRef.current) {
        return;
      }

      if (event.type === Blockly.Events.SELECTED) {
        const selectedId = (event as Blockly.Events.Selected).newElementId;
        useUiStore.getState().setSelectedBlockId(selectedId ?? undefined);
        return;
      }

      // Ignore UI-only changes (selection, viewport, toolbox focus) so they don't mutate graph state.
      if ((event as unknown as { isUiEvent?: boolean }).isUiEvent) {
        return;
      }

      const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
      const target = editTargetRef.current;

      if (target.kind === "sprite") {
        // Sprite-script edits land on the sprite, not the project graph.
        // The codegen pipeline stays bound to the project's blockly_xml.
        useStageStore.getState().updateSprite(target.id, { scripts_xml: xml });
        return;
      }

      const store = useProjectStore.getState();
      if (!store.project) {
        return;
      }

      const graph = workspaceToNormalizedGraph(workspace);

      store.setProject({
        ...store.project,
        workspace_state: {
          ...store.project.workspace_state,
          zoom: workspace.scale,
          blockly_xml: xml
        },
        normalized_graph: graph
      });
    });

    return () => {
      resizeObserver.disconnect();
      workspace.dispose();
      workspaceRef.current = null;
      setVibeWorkspace(null);
    };
  }, []);

  // Update toolbox whenever assignments or custom categories change
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    try {
      workspace.updateToolbox(
        buildToolboxXml(assignments, customCategories, categoryRenames, categoryOrder, categoryColors)
      );
    } catch {
      // Workspace may not be ready yet; initial inject already handled it
    }
    // Re-color existing workspace block instances. Flyout instances are
    // freshly created above and pick up colors via the patched init().
    applyCategoryColorsToWorkspace(workspace);
  }, [assignments, customCategories, categoryRenames, categoryOrder, categoryColors]);

  // Switch Blockly theme when dark mode changes
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    workspace.setTheme(darkMode ? warpforgeDarkTheme : warpforgeTheme);
  }, [darkMode]);

  // Re-register custom blocks whenever the customBlocksStore changes (added,
  // edited, imported). Explicitly refresh the toolbox afterward — relying on
  // the assignments-effect cascade alone misses the case where the new block
  // was registered but the toolbox was rebuilt before Blockly's flyout could
  // see it.
  useEffect(() => {
    for (const def of customBlocks) {
      registerCustomBlock(def);
    }
    // Patch any newly-registered custom block types so they also honor
    // category color overrides. The call is idempotent.
    installCategoryColorOverrides();
    const workspace = workspaceRef.current;
    if (workspace) {
      try {
        const orgState = useBlockOrgStore.getState();
        workspace.updateToolbox(
          buildToolboxXml(
            orgState.assignments,
            orgState.customCategories,
            orgState.categoryRenames,
            orgState.categoryOrder,
            orgState.categoryColors
          )
        );
      } catch {
        // Workspace may not be ready yet.
      }
    }
  }, [customBlocks]);

  // Single hydration effect — handles project switches, sprite switches,
  // and the both-at-once case (file-open of a sprite-runtime example).
  // Fires only when the *identity* of the project or selected sprite
  // changes, NOT on every workspace edit (the change listener handles
  // those incrementally via updateSprite/setProject), so the user's
  // in-progress edits aren't overwritten while they type.
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    // Determine the effective sprite (clones edit through their parent).
    const sprites = useStageStore.getState().sprites;
    const sel = selectedSpriteId ? sprites.find((s) => s.id === selectedSpriteId) : null;
    const effectiveSpriteId =
      sel?.isClone && sel.parentSpriteId ? sel.parentSpriteId : selectedSpriteId;
    const target: EditTarget = effectiveSpriteId
      ? { kind: "sprite", id: effectiveSpriteId }
      : { kind: "project" };

    // Pull the XML for the chosen target.
    let xml = "";
    if (target.kind === "sprite") {
      const sprite = sprites.find((s) => s.id === target.id);
      xml = sprite?.scripts_xml ?? "";
    } else if (project) {
      xml = project.workspace_state.blockly_xml ?? "";
    }

    try {
      hydratingRef.current = true;
      Blockly.Events.disable();
      if (xml) {
        const dom = Blockly.utils.xml.textToDom(xml);
        Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
      } else {
        workspace.clear();
      }
      editTargetRef.current = target;
    } catch (e) {
      // Surface the error so a malformed scripts_xml is visible in dev
      // tools rather than silently leaving an empty workspace.
      // eslint-disable-next-line no-console
      console.error("CenterWorkspace: failed to load XML for", target, e);
    } finally {
      Blockly.Events.enable();
      hydratingRef.current = false;
    }
  }, [project?.project.id, selectedSpriteId]);

  return (
    <section className="center-workspace">
      <div className="workspace-header">
        <div className="workspace-header-row">
          <h3>Workspace</h3>
          <button
            type="button"
            className="organize-blocks-btn"
            onClick={toggleBlockOrganizer}
            title="Organize block categories"
          >
            Organize Blocks
          </button>
        </div>
        <p className="muted">Drag blocks to model screens, state, events, AI actions, and export flows.</p>
      </div>
      <div className="workspace-canvas" ref={containerRef} />
      {showBlockOrganizer ? (
        <BlockOrganizerDialog onClose={toggleBlockOrganizer} />
      ) : null}
    </section>
  );
}
