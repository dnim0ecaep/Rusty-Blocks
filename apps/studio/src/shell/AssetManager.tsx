import { useEffect, useState } from "react";

import { AssetDetail } from "../assets/AssetDetail";
import { AssetGrid } from "../assets/AssetGrid";
import { AssetVersionList } from "../assets/AssetVersionList";
import { useAssetStore } from "../store/assetStore";
import { useUiStore } from "../store/uiStore";
import type { AssetRecord } from "../types/workspace";

export function AssetManager() {
  const { assets, loading, refresh } = useAssetStore();
  const toggleAssetManager = useUiStore((state) => state.toggleAssetManager);
  const [selected, setSelected] = useState<AssetRecord | undefined>(undefined);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected && assets.length > 0) {
      setSelected(assets[0]);
    }
  }, [assets, selected]);

  return (
    <section className="asset-manager-overlay">
      <div className="asset-manager">
        <header>
          <h3>Asset Manager</h3>
          <button type="button" onClick={toggleAssetManager}>Close</button>
        </header>
        {loading ? <p>Loading assets...</p> : null}
        <div className="asset-manager-content">
          <AssetGrid assets={assets} onSelect={setSelected} selectedAssetId={selected?.id} />
          <div>
            <AssetDetail asset={selected} />
            <AssetVersionList asset={selected} />
          </div>
        </div>
      </div>
    </section>
  );
}
