import type { AssetRecord } from "../types/workspace";

interface AssetDetailProps {
  asset?: AssetRecord;
}

export function AssetDetail({ asset }: AssetDetailProps) {
  if (!asset) {
    return <p className="muted">Select an asset to inspect details.</p>;
  }

  return (
    <div className="asset-detail">
      <h4>{asset.kind}</h4>
      <p>{asset.path}</p>
      <pre>{JSON.stringify(asset.metadata, null, 2)}</pre>
    </div>
  );
}
