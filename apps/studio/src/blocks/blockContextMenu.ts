import * as Blockly from "blockly";
import { useAiStore } from "../store/aiStore";
import { useUiStore } from "../store/uiStore";
import { useCustomBlocksStore } from "../store/customBlocksStore";
import { MY_BLOCKS_CATEGORY } from "../store/blockOrgStore";
import type { CustomBlockDef, ModuleSnippet } from "./customBlockTypes";
import { CUSTOM_BLOCK_TYPE_PREFIX } from "./customBlockTypes";

function getBlockSummary(block: Blockly.Block): Record<string, unknown> {
  const fields: Record<string, string> = {};
  for (const input of block.inputList) {
    for (const field of input.fieldRow) {
      if (field.name) {
        fields[field.name] = field.getText();
      }
    }
  }

  const connectedInputs: string[] = [];
  for (const input of block.inputList) {
    const target = input.connection?.targetBlock();
    if (target) connectedInputs.push(target.type);
  }

  return {
    type: block.type,
    fields,
    connectedInputs,
    tooltip: block.tooltip,
  };
}

function slugifyForBlockType(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function registerOnce(
  id: string,
  options: Omit<Blockly.ContextMenuRegistry.RegistryItem, "id">
): void {
  if (Blockly.ContextMenuRegistry.registry.getItem(id)) return;
  Blockly.ContextMenuRegistry.registry.register({ id, ...options });
}

export function registerBlockExplainMenu(): void {
  registerOnce("explain_block", {
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    displayText: "Explain this block",
    weight: 100,
    preconditionFn: () => "enabled",
    callback(scope) {
      const block = scope.block;
      if (!block) return;

      const summary = getBlockSummary(block);
      const prompt =
        `Explain what the "${block.type}" block does in the Rustyblocks / WarpForge visual editor. ` +
        `Here are its current settings: ${JSON.stringify(summary, null, 2)}. ` +
        `Give a short, plain-English explanation of what it does and when to use it.`;

      const ui = useUiStore.getState();
      if (!ui.showAiPanel) ui.toggleAiPanel();

      useAiStore.getState().runPrompt("explanation", prompt, summary);
    },
  });

  registerOnce("save_as_module", {
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    displayText: "Save as Module Snippet…",
    weight: 101,
    preconditionFn: () => "enabled",
    callback(scope) {
      const block = scope.block;
      if (!block) return;

      const dom = Blockly.Xml.blockToDom(block, /* opt_noId */ false);
      const xml = Blockly.Xml.domToText(dom);

      const name = window.prompt("Snippet name:", block.type);
      if (!name) return;
      const description = window.prompt("Description (optional):", "") ?? "";

      const snippet: ModuleSnippet = {
        id: `snip_${Date.now().toString(36)}`,
        name: name.trim(),
        description: description.trim(),
        xml: `<xml xmlns="https://developers.google.com/blockly/xml">${xml}</xml>`,
        createdAt: new Date().toISOString(),
      };
      useCustomBlocksStore.getState().addSnippet(snippet);
    },
  });

  registerOnce("save_as_composite_block", {
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    displayText: "Save as Composite Block…",
    weight: 102,
    preconditionFn: () => "enabled",
    callback(scope) {
      const block = scope.block;
      if (!block) return;

      const dom = Blockly.Xml.blockToDom(block, /* opt_noId */ false);
      const xml = Blockly.Xml.domToText(dom);
      const wrappedXml = `<xml xmlns="https://developers.google.com/blockly/xml">${xml}</xml>`;

      // Count blocks in the captured subtree (including nested next-chain).
      const countBlocks = (b: Blockly.Block): number => {
        let n = 1;
        for (const input of b.inputList) {
          const target = input.connection?.targetBlock();
          if (target) n += countBlocks(target);
        }
        const next = b.getNextBlock();
        if (next) n += countBlocks(next);
        return n;
      };
      const blockCount = countBlocks(block);

      const name = window.prompt(
        "Module name (becomes a single block in the toolbox):",
        block.type
      );
      if (!name) return;
      const trimmed = name.trim();
      const slug = slugifyForBlockType(trimmed);
      if (!slug) {
        window.alert("Module name must contain at least one letter or digit.");
        return;
      }

      const store = useCustomBlocksStore.getState();
      const newType = `${CUSTOM_BLOCK_TYPE_PREFIX}${slug}`;
      if (store.getBlock(newType)) {
        if (
          !window.confirm(
            `A custom block named "${newType}" already exists. Overwrite?`
          )
        ) {
          return;
        }
      }

      const now = new Date().toISOString();
      const def: CustomBlockDef = {
        type: newType,
        kindKind: "composite",
        label: trimmed,
        tooltip: `Composite module wrapping ${blockCount} block(s) — right-click to expand.`,
        category: MY_BLOCKS_CATEGORY,
        color: "#7b61ff",
        fields: [],
        hasPrevious: true,
        hasNext: true,
        createdAt: now,
        updatedAt: now,
        subgraphXml: wrappedXml,
        subgraphBlockCount: blockCount,
      };
      store.upsertBlock(def);
    },
  });

  registerOnce("expand_composite_block", {
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    displayText: "Expand Composite Block here",
    weight: 103,
    preconditionFn(scope) {
      const block = scope.block;
      if (!block) return "hidden";
      const def = useCustomBlocksStore.getState().getBlock(block.type);
      if (!def || def.kindKind !== "composite" || !def.subgraphXml) {
        return "hidden";
      }
      return "enabled";
    },
    callback(scope) {
      const block = scope.block;
      if (!block) return;
      const def = useCustomBlocksStore.getState().getBlock(block.type);
      if (!def || def.kindKind !== "composite" || !def.subgraphXml) return;

      const workspace = block.workspace as Blockly.WorkspaceSvg;
      const xy = block.getRelativeToSurfaceXY();

      try {
        const dom = Blockly.utils.xml.textToDom(def.subgraphXml);
        // Wrap children under a workspace dom — appendDomToWorkspace expects an <xml> root.
        const ids = Blockly.Xml.appendDomToWorkspace(dom, workspace);

        // Position the first inserted block at the composite's coords, then dispose.
        if (ids.length > 0) {
          const inserted = workspace.getBlockById(ids[0]);
          if (inserted) inserted.moveBy(xy.x - inserted.getRelativeToSurfaceXY().x, xy.y - inserted.getRelativeToSurfaceXY().y);
        }
        block.dispose(false);
      } catch (err) {
        console.error("Failed to expand composite block:", err);
        window.alert(`Could not expand composite block: ${String(err)}`);
      }
    },
  });
}
