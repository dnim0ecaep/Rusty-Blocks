import { create } from "zustand";

import { aiRunMode } from "../api/tauriClient";
import type { AiMode, AiMessage } from "../types/ai";

export interface AiConfig {
  ollama: {
    url: string;
    model: string;
  };
  comfyui: {
    url: string;
  };
  openai: {
    url: string;
    model: string;
    apiKey: string;
  };
  developerInstructions: string;
}

const DEFAULT_CONFIG: AiConfig = {
  ollama: {
    url: "http://127.0.0.1:11434",
    model: "llama3.1"
  },
  comfyui: {
    url: "http://127.0.0.1:8188"
  },
  openai: {
    url: "https://api.openai.com",
    model: "gpt-4o-mini",
    apiKey: ""
  },
  developerInstructions: ""
};

const CONFIG_STORAGE_KEY = "warpforge_ai_config";

function loadConfigFromStorage(): AiConfig {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn("Failed to load AI config from localStorage:", error);
  }
  return DEFAULT_CONFIG;
}

type ProviderKey = "ollama" | "comfyui" | "openai";

function providerSettings(
  config: AiConfig,
  provider: string
): AiConfig[ProviderKey] | Record<string, never> {
  if (provider === "ollama" || provider === "comfyui" || provider === "openai") {
    return config[provider];
  }
  return {};
}

function saveConfigToStorage(config: AiConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn("Failed to save AI config to localStorage:", error);
  }
}

interface AiStore {
  messages: AiMessage[];
  provider: string;
  busy: boolean;
  config: AiConfig;
  showSettings: boolean;
  connectionStatus: Record<string, "idle" | "testing" | "success" | "error">;
  connectionError: Record<string, string>;
  setProvider(provider: string): void;
  toggleSettings(): void;
  updateConfig(updates: Partial<AiConfig>): void;
  runPrompt(
    mode: AiMode,
    prompt: string,
    context?: Record<string, unknown>
  ): Promise<RunPromptResult>;
  testConnection(provider: string): Promise<void>;
}

export interface RunPromptResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}

export const useAiStore = create<AiStore>((set, get) => ({
  messages: [],
  provider: "ollama",
  busy: false,
  config: loadConfigFromStorage(),
  showSettings: false,
  connectionStatus: {},
  connectionError: {},

  setProvider(provider) {
    set({ provider });
  },

  toggleSettings() {
    set((state) => ({ showSettings: !state.showSettings }));
  },

  updateConfig(updates) {
    set((state) => {
      const newConfig = { ...state.config, ...updates };
      saveConfigToStorage(newConfig);
      return { config: newConfig };
    });
  },

  async testConnection(provider) {
    set((state) => ({
      connectionStatus: { ...state.connectionStatus, [provider]: "testing" },
      connectionError: { ...state.connectionError, [provider]: "" }
    }));

    try {
      const { config } = get();
      const providerConfig = providerSettings(config, provider);
      
      // Use appropriate mode for each provider
      const mode = provider === "comfyui" ? "image" : "text";
      const prompt = mode === "image" 
        ? "test pattern" 
        : "Reply with just the word 'OK' to confirm connection.";
      
      console.log(`Testing connection to ${provider}...`);
      
      // Send a simple test prompt
      const response = await aiRunMode({
        mode,
        prompt,
        provider,
        context: { test: true },
        providerUrl: 'url' in providerConfig ? providerConfig.url : undefined,
        model: 'model' in providerConfig ? providerConfig.model : undefined,
        apiKey: 'apiKey' in providerConfig ? providerConfig.apiKey : undefined,
      });

      console.log(`Response from ${provider}:`, response);

      // Check if we got a valid response with actual output
      if (!response) {
        throw new Error("No response from AI provider");
      }
      
      if (!response.output) {
        throw new Error("Response missing output data");
      }

      // Verify the output has content
      const output = response.output as any;
      
      if (mode === "image") {
        // For image mode, just check that we got output (ComfyUI might have different structure)
        if (!output || (typeof output === 'object' && Object.keys(output).length === 0)) {
          throw new Error("Response output is empty");
        }
      } else {
        // For text mode, verify we have text content
        if (!output || !output.text || output.text.trim() === "") {
          throw new Error("Response output is empty or missing text");
        }
      }

      set((state) => ({
        connectionStatus: { ...state.connectionStatus, [provider]: "success" }
      }));
      
      console.log(`✅ ${provider} connection successful`);
    } catch (error) {
      console.error(`❌ ${provider} connection failed:`, error);
      set((state) => ({
        connectionStatus: { ...state.connectionStatus, [provider]: "error" },
        connectionError: { ...state.connectionError, [provider]: String(error) }
      }));
    }
  },

  async runPrompt(mode, prompt, context = {}) {
    const idBase = crypto.randomUUID();
    const userMessage: AiMessage = {
      id: `${idBase}-u`,
      role: "user",
      mode,
      content: prompt,
      timestamp: new Date().toISOString()
    };

    set((state) => ({ messages: [...state.messages, userMessage], busy: true }));

    try {
      const { provider, config } = get();
      const providerConfig = providerSettings(config, provider);

      // Prepend developer instructions to text-style prompts. Image
      // generation is a single descriptive prompt, so leave it alone.
      const instructions = config.developerInstructions.trim();
      const finalPrompt = instructions && mode !== "image"
        ? `${instructions}\n\n${prompt}`
        : prompt;

      const response = await aiRunMode({
        mode,
        prompt: finalPrompt,
        provider,
        context,
        providerUrl: 'url' in providerConfig ? providerConfig.url : undefined,
        model: 'model' in providerConfig ? providerConfig.model : undefined,
        apiKey: 'apiKey' in providerConfig ? providerConfig.apiKey : undefined,
      });

      const assistantMessage: AiMessage = {
        id: `${idBase}-a`,
        role: "assistant",
        mode,
        content: JSON.stringify(response.output, null, 2),
        output: response.output,
        timestamp: response.created_at
      };

      set((state) => ({ messages: [...state.messages, assistantMessage] }));
      return { ok: true, output: response.output };
    } catch (error) {
      const errStr = String(error);
      const assistantMessage: AiMessage = {
        id: `${idBase}-e`,
        role: "assistant",
        mode,
        content: `AI request failed: ${errStr}`,
        timestamp: new Date().toISOString()
      };
      set((state) => ({ messages: [...state.messages, assistantMessage] }));
      return { ok: false, error: errStr };
    } finally {
      set({ busy: false });
    }
  }
}));
