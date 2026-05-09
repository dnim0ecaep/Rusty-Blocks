import { FormEvent, useMemo, useState } from "react";

import {
  CUSTOM_BLOCK_TYPE_PREFIX,
  CustomBlockDef,
  CustomBlockField,
  CustomFieldType
} from "../blocks/customBlockTypes";
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultDef(): CustomBlockDef {
  const now = new Date().toISOString();
  return {
    type: `${CUSTOM_BLOCK_TYPE_PREFIX}new_block`,
    kindKind: "designed",
    label: "my block",
    tooltip: "",
    category: MY_BLOCKS_CATEGORY,
    color: "my_blocks",
    fields: [],
    hasPrevious: true,
    hasNext: true,
    createdAt: now,
    updatedAt: now
  };
}

function defaultDefFromCode(): CustomBlockDef {
  const base = defaultDef();
  return {
    ...base,
    kindKind: "code_import",
    label: "rust snippet",
    fields: [
      {
        type: "field_multilinetext",
        name: "SOURCE",
        label: "source",
        defaultValue: "// paste Rust code here"
      }
    ]
  };
}

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
    const slug = slugify(label) || "block";
    const newType = `${CUSTOM_BLOCK_TYPE_PREFIX}${slug}`;
    setDef({
      ...def,
      label,
      type: initial ? def.type : newType
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

    if (!def.label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!def.type.startsWith(CUSTOM_BLOCK_TYPE_PREFIX)) {
      setError(`Block type must start with "${CUSTOM_BLOCK_TYPE_PREFIX}".`);
      return;
    }
    if (existingTypes.has(def.type)) {
      setError(`A block with type "${def.type}" already exists. Change the label.`);
      return;
    }
    for (const field of def.fields) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(field.name)) {
        setError(`Field name "${field.name}" must be UPPERCASE with underscores.`);
        return;
      }
      if (field.type === "field_dropdown" && (!field.options || field.options.length === 0)) {
        setError(`Dropdown field "${field.name}" needs at least one option.`);
        return;
      }
    }

    upsertBlock({ ...def, updatedAt: new Date().toISOString() });
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
