import { useProjectStore } from "../store/projectStore";

export function IrViewPanel() {
  const ir = useProjectStore((state) => state.ir);

  return <pre className="panel-code">{ir ? JSON.stringify(ir, null, 2) : "IR not generated yet."}</pre>;
}
