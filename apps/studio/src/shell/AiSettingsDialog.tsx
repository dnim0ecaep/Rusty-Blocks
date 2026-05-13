import { FormEvent, useState } from "react";
import { useAiStore, type AiConfig } from "../store/aiStore";

export function AiSettingsDialog() {
  const { config, showSettings, toggleSettings, updateConfig, testConnection, connectionStatus, connectionError } = useAiStore();
  const [localConfig, setLocalConfig] = useState<AiConfig>(config);
  const [showApiKey, setShowApiKey] = useState(false);

  if (!showSettings) {
    return null;
  }

  const handleTestConnection = async (provider: string) => {
    await testConnection(provider);
  };

  const getStatusIcon = (provider: string) => {
    const status = connectionStatus[provider];
    switch (status) {
      case "testing": return "⏳";
      case "success": return "✅";
      case "error": return "❌";
      default: return "";
    }
  };

  const getStatusText = (provider: string) => {
    const status = connectionStatus[provider];
    switch (status) {
      case "testing": return "Testing...";
      case "success": return "Connected";
      case "error": return `Error: ${connectionError[provider] || "Connection failed"}`;
      default: return "";
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateConfig(localConfig);
    toggleSettings();
  };

  const handleCancel = () => {
    setLocalConfig(config); // Reset to saved config
    toggleSettings();
  };

  return (
    <section className="ai-settings-overlay" role="dialog" aria-modal="true" aria-label="AI Settings">
      <form className="ai-settings-dialog" onSubmit={handleSubmit}>
        <header>
          <h2>AI Settings</h2>
          <button type="button" onClick={handleCancel} className="close-button" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="ai-settings-content">
          {/* Developer instructions — prepended to every text-mode
              prompt as a system-style preamble so all providers share
              the same persona / rules. */}
          <section className="provider-section">
            <h3>Developer Instructions</h3>
            <label>
              System prompt
              <textarea
                value={localConfig.developerInstructions}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    developerInstructions: e.target.value
                  })
                }
                placeholder="e.g. You are a helpful assistant for a Scratch-style block editor. Keep replies short and code-friendly."
                rows={6}
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
              <small className="hint">
                Prepended to every text, recommendation, and explanation prompt. Leave blank to disable.
              </small>
            </label>
          </section>

          {/* Ollama Settings */}
          <section className="provider-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Ollama (Local LLM)</h3>
              <button
                type="button"
                onClick={() => handleTestConnection("ollama")}
                disabled={connectionStatus.ollama === "testing"}
                style={{ fontSize: "0.9em", padding: "0.3em 0.8em" }}
              >
                {getStatusIcon("ollama")} Test Connection
              </button>
            </div>
            {connectionStatus.ollama && (
              <div style={{ marginBottom: "0.5em", fontSize: "0.9em", color: connectionStatus.ollama === "error" ? "#d32f2f" : "#2e7d32" }}>
                {getStatusText("ollama")}
              </div>
            )}
            <label>
              Base URL
              <input
                type="url"
                value={localConfig.ollama.url}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    ollama: { ...localConfig.ollama, url: e.target.value }
                  })
                }
                placeholder="http://127.0.0.1:11434"
                required
              />
            </label>
            <label>
              Model
              <input
                type="text"
                value={localConfig.ollama.model}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    ollama: { ...localConfig.ollama, model: e.target.value }
                  })
                }
                placeholder="llama3.1"
                required
              />
              <small className="hint">Common models: llama3.1, mistral, codellama, qwen2.5</small>
            </label>
          </section>

          {/* ComfyUI Settings */}
          <section className="provider-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>ComfyUI (Image Generation)</h3>
              <button
                type="button"
                onClick={() => handleTestConnection("comfyui")}
                disabled={connectionStatus.comfyui === "testing"}
                style={{ fontSize: "0.9em", padding: "0.3em 0.8em" }}
              >
                {getStatusIcon("comfyui")} Test Connection
              </button>
            </div>
            {connectionStatus.comfyui && (
              <div style={{ marginBottom: "0.5em", fontSize: "0.9em", color: connectionStatus.comfyui === "error" ? "#d32f2f" : "#2e7d32" }}>
                {getStatusText("comfyui")}
              </div>
            )}
            <label>
              Base URL
              <input
                type="url"
                value={localConfig.comfyui.url}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    comfyui: { ...localConfig.comfyui, url: e.target.value }
                  })
                }
                placeholder="http://127.0.0.1:8188"
                required
              />
            </label>
          </section>

          {/* OpenAI Settings */}
          <section className="provider-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>OpenAI (Cloud)</h3>
              <button
                type="button"
                onClick={() => handleTestConnection("openai")}
                disabled={connectionStatus.openai === "testing"}
                style={{ fontSize: "0.9em", padding: "0.3em 0.8em" }}
              >
                {getStatusIcon("openai")} Test Connection
              </button>
            </div>
            {connectionStatus.openai && (
              <div style={{ marginBottom: "0.5em", fontSize: "0.9em", color: connectionStatus.openai === "error" ? "#d32f2f" : "#2e7d32" }}>
                {getStatusText("openai")}
              </div>
            )}
            <label>
              API Key
              <div style={{ display: "flex", gap: "0.4em" }}>
                <input
                  type={showApiKey ? "text" : "password"}
                  value={localConfig.openai.apiKey}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      openai: { ...localConfig.openai, apiKey: e.target.value }
                    })
                  }
                  placeholder="sk-..."
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  style={{ flexShrink: 0 }}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
              <small className="hint">Required for OpenAI provider</small>
            </label>
            <label>
              Model
              <input
                type="text"
                value={localConfig.openai.model}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    openai: { ...localConfig.openai, model: e.target.value }
                  })
                }
                placeholder="gpt-4o-mini"
                required
              />
              <small className="hint">Common models: gpt-4o, gpt-4o-mini, gpt-4-turbo</small>
            </label>
            <label>
              Custom Endpoint (optional)
              <input
                type="url"
                value={localConfig.openai.url}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    openai: { ...localConfig.openai, url: e.target.value }
                  })
                }
                placeholder="https://api.openai.com"
              />
              <small className="hint">Works with any OpenAI-compatible API (e.g. LM Studio, Groq, Together, local proxies)</small>
            </label>
          </section>
        </div>

        <footer className="ai-settings-actions">
          <button type="button" onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit">Save Settings</button>
        </footer>
      </form>
    </section>
  );
}
