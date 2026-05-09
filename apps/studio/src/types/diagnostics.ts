export type Severity = "info" | "warning" | "error";

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  node_id?: string;
  location?: {
    node_id?: string;
    field?: string;
  };
  hint?: string;
}
