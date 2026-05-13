import { FormEvent, useMemo, useState } from "react";

import {
  CustomBlockDef,
  CustomBlockField,
  CustomFieldType,
} from "../blocks/customBlockTypes";
import {
  defaultDef,
  defaultDefFromCode,
  typeFromLabel,
  validateAndNormalize,
} from "../blocks/customBlockValidation";
import { BLOCK_REGISTRY } from "../blocks/blockRegistry";
import { MY_BLOCKS_CATEGORY, useBlockOrgStore } from "../store/blockOrgStore";
import { useCustomBlocksStore } from "../store/customBlocksStore";

interface Props {
  /** When provided, the dialog edits an existing block instead of creating one. */
  initial?: CustomBlockDef;
  onClose(): void;
}

const FIELD_TYPE_OPTIONS: Array<[CustomFieldType, string]> = [
  ["field_input", "Text"],
  ["field_number", "Number"],
  ["field_checkbox", "Checkbox"],
  ["field_dropdown", "Dropdown"],
  ["field_multilinetext", "Multiline text"]
];

const STYLE_OPTIONS = [
  "my_blocks",
  "project_blocks",
  "structure_blocks",
  "ui_blocks",
  "logic_blocks",
  "state_blocks",
  "events_blocks",
  "io_blocks",
  "network_blocks",
  "ai_blocks",
  "export_blocks",
  "rust_blocks",
  "tw_modules_blocks"
];

// Helpers (`slugify`, `defaultDef`, `defaultDefFromCode`,
// `validateAndNormalize`) live in `../blocks/customBlockValidation` so
// the rules are unit-tested without mounting this dialog.

export function BlockDesignerDialog({ initial, onClose }: Props) {
  const [def, setDef] = useState<CustomBlockDef>(() => initial ?? defaultDef());
  const [error, setError] = useState<string>("");
  const upsertBlock = useCustomBlocksStore((s) => s.upsertBlock);
  const customCategories = useBlockOrgStore((s) => s.customCategories);

  const allCategoryNames = useMemo(
    () => [
      MY_BLOCKS_CATEGORY,
      "Project",
      "Structure",
      "UI",
      "Logic",
      "State/Data",
      "Events",
      "IO / Storage",
      "Network",
      "AI",
      "Export",
      "Rust",
      ...customCategories.map((c) => c.name)
    ],
    [customCategories]
  );

  const existingTypes = useMemo(() => {
    const builtIn = new Set(BLOCK_REGISTRY.map((b) => b.type));
    const custom = new Set(useCustomBlocksStore.getState().blocks.map((b) => b.type));
    if (initial) custom.delete(initial.type); // editing this one is OK
    return new Set([...builtIn, ...custom]);
  }, [initial]);

  const setMode = (mode: "designed" | "code_import") => {
    if (def.kindKind === mode) return;
    if (mode === "code_import") {
      setDef({ ...def, ...defaultDefFromCode(), type: def.type, label: def.label });
    } else {
      setDef({ ...def, kindKind: "designed" });
    }
  };

  const setLabel = (label: string) => {
    setDef({
      ...def,
      label,
      // Editing locks the type so existing references keep working.
      // For new blocks the type tracks the label so the saved record
      // never disagrees with what the user sees.
      type: initial ? def.type : typeFromLabel(label),
    });
  };

  const setField = (index: number, partial: Partial<CustomBlockField>) => {
    const next = def.fields.map((f, i) => (i === index ? { ...f, ...partial } : f));
    setDef({ ...def, fields: next });
  };

  const addField = () => {
    const idx = def.fields.length + 1;
    const newField: CustomBlockField = {
      type: "field_input",
      name: `FIELD_${idx}`,
      label: `field ${idx}`,
      defaultValue: ""
    };
    setDef({ ...def, fields: [...def.fields, newField] });
  };

  const removeField = (index: number) => {
    setDef({ ...def, fields: def.fields.filter((_, i) => i !== index) });
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= def.fields.length) return;
    const next = [...def.fields];
    [next[index], next[target]] = [next[target], next[index]];
    setDef({ ...def, fields: next });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const result = validateAndNormalize(def, {
      existingTypes,
      isEditing: !!initial,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    upsertBlock({ ...result.def, updatedAt: new Date().toISOString() });
    onClose();
  };

  return (
    <div className="block-designer-overlay" onClick={onClose}>
      <div className="block-designer-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{initial ? "Edit Block" : "Design a New Block"}</h2>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="block-designer-mode">
          <button
            type="button"
            className={def.kindKind === "designed" ? "active" : ""}
            onClick={() => setMode("designed")}
          >
            Designed Block
          </button>
          <button
            type="button"
            className={def.kindKind === "code_import" ? "active" : ""}
            onClick={() => setMode("code_import")}
          >
            From Code
          </button>
        </div>

        <form onSubmit={onSubmit} className="block-designer-form">
          <label className="form-row">
            <span>Label</span>
            <input
              type="text"
              value={def.label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </label>

          <label className="form-row">
            <span>Block type (auto)</span>
            <input
              type="text"
              value={def.type}
              onChange={(e) => setDef({ ...def, type: e.target.value })}
              readOnly={!!initial}
            />
          </label>

          <label className="form-row">
            <span>Tooltip</span>
            <input
              type="text"
              value={def.tooltip}
              onChange={(e) => setDef({ ...def, tooltip: e.target.value })}
            />
          </label>

          <label className="form-row">
            <span>Category</span>
            <select
              value={def.category}
              onChange={(e) => setDef({ ...def, category: e.target.value })}
            >
              {allCategoryNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-row">
            <span>Color</span>
            <select
              value={def.color}
              onChange={(e) => setDef({ ...def, color: e.target.value })}
            >
              {STYLE_OPTIONS.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
              <option value="#ff7f50">custom hex (orange)</option>
              <option value="#888888">custom hex (gray)</option>
            </select>
          </label>

          <div className="form-row">
            <label>
              <input
                type="checkbox"
                checked={def.hasPrevious}
                onChange={(e) => setDef({ ...def, hasPrevious: e.target.checked })}
              />{" "}
              Has previous connector
            </label>
            <label style={{ marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={def.hasNext}
                onChange={(e) => setDef({ ...def, hasNext: e.target.checked })}
              />{" "}
              Has next connector
            </label>
          </div>

          <div className="form-section">
            <div className="form-section-header">
              <h3>Fields</h3>
              <button type="button" onClick={addField}>
                + Add field
              </button>
            </div>
            {def.fields.length === 0 ? (
              <p className="muted">No fields. Add one to make this block configurable.</p>
            ) : (
              <ul className="field-list">
                {def.fields.map((field, i) => (
                  <li key={i} className="field-row">
                    <input
                      type="text"
                      value={field.label}
                      placeholder="label"
                      onChange={(e) => setField(i, { label: e.target.value })}
                    />
                    <input
                      type="text"
                      value={field.name}
                      placeholder="NAME"
                      onChange={(e) =>
                        setField(i, { name: e.target.value.toUpperCase() })
                      }
                      style={{ width: 140 }}
                    />
                    <select
                      value={field.type}
                      onChange={(e) =>
                        setField(i, { type: e.target.value as CustomFieldType })
                      }
                    >
                      {FIELD_TYPE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {field.type === "field_dropdown" ? (
                      <input
                        type="text"
                        placeholder="opt1,opt2,opt3"
                        value={(field.options ?? []).map(([d, _v]) => d).join(",")}
                        onChange={(e) => {
                          const options: Array<[string, string]> = e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .map((s) => [s, s] as [string, string]);
                          setField(i, { options });
                        }}
                      />
                    ) : field.type === "field_checkbox" ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(field.defaultValue)}
                          onChange={(e) =>
                            setField(i, { defaultValue: e.target.checked })
                          }
                        />{" "}
                        default
                      </label>
                    ) : (
                      <input
                        type={field.type === "field_number" ? "number" : "text"}
                        placeholder="default"
                        value={String(field.defaultValue ?? "")}
                        onChange={(e) =>
                          setField(i, {
                            defaultValue:
                              field.type === "field_number"
                                ? Number(e.target.value)
                                : e.target.value
                          })
                        }
                      />
                    )}
                    <button type="button" onClick={() => moveField(i, -1)} title="Move up">
                      ↑
                    </button>
                    <button type="button" onClick={() => moveField(i, 1)} title="Move down">
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      title="Remove field"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <footer className="block-designer-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">{initial ? "Update Block" : "Create Block"}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
