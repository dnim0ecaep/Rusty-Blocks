import type { AiMode } from "../types/ai";

export interface QuickAction {
  id: string;
  label: string;
  mode: AiMode;
  prompt: string;
}

export const quickActions: QuickAction[] = [
  {
    id: "icon",
    label: "Generate App Icon",
    mode: "image",
    prompt: "Generate a clean app icon for a productivity desktop app."
  },
  {
    id: "onboarding",
    label: "Onboarding Copy",
    mode: "text",
    prompt: "Write onboarding copy in 4 short steps for first-time users."
  },
  {
    id: "layout",
    label: "Suggest Layout",
    mode: "recommendation",
    prompt: "Suggest a better layout for a desktop app with sidebar, content, and details panel."
  },
  {
    id: "explain",
    label: "Explain Block Flow",
    mode: "explanation",
    prompt: "Explain what the currently selected block flow is doing in simple terms."
  }
];
