import { FormEvent, useMemo, useState } from "react";

import { quickActions } from "../ai/quickActions";
import { renderAiResult } from "../ai/resultRenderers";
import { useAiStore } from "../store/aiStore";
import type { AiMode } from "../types/ai";

export function AiSidePanel() {
  const { messages, provider, busy, setProvider, runPrompt, toggleSettings } = useAiStore();
  const [mode, setMode] = useState<AiMode>("text");
  const [prompt, setPrompt] = useState("");

  const recent = useMemo(() => messages.slice(-8), [messages]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }
    await runPrompt(mode, prompt, {});
    setPrompt("");
  };

  const providerDisplayName = {
    ollama: "Ollama (local)",
    comfyui: "ComfyUI (image)",
    openai: "OpenAI (cloud)"
  }[provider] || provider;

  return (
    <aside className="ai-side-panel">
      <header className="ai-panel-header">
        <h3>AI Copilot</h3>
        <button type="button" onClick={toggleSettings} className="config-button" title="Configure AI Settings">
          ⚙️
        </button>
      </header>
      <div className="ai-provider-info">
        <label>
          Provider
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="ollama">Ollama (local)</option>
            <option value="comfyui">ComfyUI (image)</option>
            <option value="openai">OpenAI (cloud)</option>
          </select>
        </label>
      </div>
      <label>
        Mode
        <select value={mode} onChange={(event) => setMode(event.target.value as AiMode)}>
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="recommendation">Recommendation</option>
          <option value="explanation">Explanation</option>
        </select>
      </label>
      <form onSubmit={onSubmit}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Generate an icon, rewrite copy, suggest layout, explain block flow..."
        />
        <button type="submit" disabled={busy}>
          {busy ? "Running..." : "Run"}
        </button>
      </form>
      <div className="ai-quick-actions">
        {quickActions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => runPrompt(action.mode, action.prompt, {})}
            disabled={busy}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="ai-messages">
        {recent.map((message) => (
          <article key={message.id} className={`ai-msg ${message.role}`}>
            <header>
              <span>{message.role}</span>
              <small>{message.mode}</small>
            </header>
            {renderAiResult(message)}
          </article>
        ))}
      </div>
    </aside>
  );
}
