import type { AssetRecord } from "../types/workspace";

interface AssetVersionListProps {
  asset?: AssetRecord;
}

export function AssetVersionList({ asset }: AssetVersionListProps) {
  if (!asset) {
    return null;
  }

  return (
    <div className="asset-versions">
      <h5>Versions</h5>
      <p>v{asset.version}</p>
      <p>{new Date(asset.created_at).toLocaleString()}</p>
    </div>
  );
}
