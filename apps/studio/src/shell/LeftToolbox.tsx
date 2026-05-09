import { useMemo, useState } from "react";

import { blockCategories } from "../blocks/toolboxCatalog";
import { TURBOWARP_MODULES, TURBOWARP_MODULE_SNAPSHOT_DATE } from "../blocks/turbowarpModules";
import { BLOCK_REGISTRY, getBlocksByCategory } from "../blocks/blockRegistry";

const favorites = ["Project", "UI", "Events", "AI"];

export function LeftToolbox() {
  const [query, setQuery] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const filtered = useMemo(
    () => blockCategories.filter((category) => category.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const handleCategoryClick = (category: string) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  const getCategoryDisplayName = (category: string): string => {
    const map: Record<string, string> = {
      project: "Project",
      structure: "Structure",
      ui: "UI",
      logic: "Logic",
      state: "State/Data",
      events: "Events",
      io: "IO / Storage",
      network: "Network",
      ai: "AI",
      export: "Export"
    };
    return map[category] || category;
  };

  const blockCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const block of BLOCK_REGISTRY) {
      counts[block.category] = (counts[block.category] || 0) + 1;
    }
    return counts;
  }, []);

  return (
    <aside className="left-toolbox">
      <h3>Toolbox</h3>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search blocks..."
        className="toolbox-search"
      />
      <section>
        <h4>Favorites</h4>
        <ul className="category-list">
          {favorites.map((item) => {
            const categoryKey = item.toLowerCase().replace(/\s+/g, "_").replace("/", "");
            const count = blockCount[categoryKey] || 0;
            return (
              <li key={item} className="category-item clickable" onClick={() => handleCategoryClick(categoryKey)}>
                <span className="category-name">{item}</span>
                <span className="category-count">{count}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h4>All Categories</h4>
        <ul className="category-list">
          {filtered.map((category) => {
            const categoryKey = category.toLowerCase().replace(/\s+/g, "_").replace("/", "");
            const blocks = getBlocksByCategory(categoryKey);
            const isExpanded = expandedCategory === categoryKey;
            
            return (
              <li key={category} className="category-item">
                <div 
                  className="category-header clickable" 
                  onClick={() => handleCategoryClick(categoryKey)}
                >
                  <span className="category-name">{category}</span>
                  <span className="category-count">{blocks.length}</span>
                  <span className="category-toggle">{isExpanded ? "▼" : "▶"}</span>
                </div>
                {isExpanded && blocks.length > 0 && (
                  <ul className="block-list">
                    {blocks.map((block) => (
                      <li key={block.type} className="block-item" title={block.description}>
                        {block.label}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h4>Recent</h4>
        <p className="muted">Recent block activity appears while editing.</p>
      </section>
      <section>
        <h4>TurboWarp Modules</h4>
        <p className="muted">
          {TURBOWARP_MODULES.length} modules loaded (snapshot {TURBOWARP_MODULE_SNAPSHOT_DATE}).
        </p>
      </section>
    </aside>
  );
}
