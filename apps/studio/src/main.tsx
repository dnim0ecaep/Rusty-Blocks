import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { App } from "./App";
import { setCurrentView } from "./runtime/stateView";
import { makeZustandView } from "./runtime/views/zustandView";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/blocks.css";

// Wire the runtime engine to the studio's zustand stores. Must happen
// before any sprite-runtime code reads state.
setCurrentView(makeZustandView());

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
