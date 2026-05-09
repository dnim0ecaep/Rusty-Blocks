import type { AssetRecord } from "../types/workspace";

interface AssetGridProps {
  assets: AssetRecord[];
  onSelect(asset: AssetRecord): void;
  selectedAssetId?: string;
}

export function AssetGrid({ assets, onSelect, selectedAssetId }: AssetGridProps) {
  return (
    <div className="asset-grid">
      {assets.map((asset) => (
        <button
          key={asset.id}
          className={asset.id === selectedAssetId ? "asset-card active" : "asset-card"}
          type="button"
          onClick={() => onSelect(asset)}
        >
          <p className="asset-kind">{asset.kind}</p>
          <p className="asset-path">{asset.path}</p>
        </button>
      ))}
    </div>
  );
}
