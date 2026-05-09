import { create } from "zustand";

import type { Diagnostic } from "../types/diagnostics";

interface ValidationStore {
  diagnostics: Diagnostic[];
  setDiagnostics(diagnostics: Diagnostic[]): void;
  errorCount: () => number;
  warningCount: () => number;
}

export const useValidationStore = create<ValidationStore>((set, get) => ({
  diagnostics: [],
  setDiagnostics(diagnostics) {
    set({ diagnostics });
  },
  errorCount() {
    return get().diagnostics.filter((diag) => diag.severity === "error").length;
  },
  warningCount() {
    return get().diagnostics.filter((diag) => diag.severity === "warning").length;
  }
}));
