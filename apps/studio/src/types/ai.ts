export type AiMode = "text" | "image" | "recommendation" | "explanation";

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  mode: AiMode;
  content: string;
  timestamp: string;
  output?: unknown;
}
