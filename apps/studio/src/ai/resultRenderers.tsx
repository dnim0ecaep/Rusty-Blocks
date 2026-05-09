import type { AiMessage } from "../types/ai";

export function renderAiResult(message: AiMessage) {
  if (typeof message.output === "object" && message.output !== null) {
    return <pre className="ai-result-json">{JSON.stringify(message.output, null, 2)}</pre>;
  }

  return <p className="ai-result-text">{message.content}</p>;
}
