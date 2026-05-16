import { create } from "zustand";

import {
  aiRunMode,
  anthropicOauthComplete,
  anthropicOauthRefresh,
  anthropicOauthStart,
  type AnthropicOAuthTokens,
} from "../api/tauriClient";
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
  anthropic: {
    url: string;
    model: string;
    apiKey: string;
    /**
     * Which credential to authenticate `/v1/messages` with. `api_key`
     * uses the pay-per-token console.anthropic.com key; `subscription`
     * uses an OAuth access token tied to a Claude.ai Pro/Max
     * subscription (signed in via the Anthropic OAuth flow).
     */
    authMode: "api_key" | "subscription";
    /**
     * Persisted OAuth state when `authMode === "subscription"`. Null
     * when not signed in. We keep the refresh token so the next
     * session can refresh silently without sending the user back
     * through the browser.
     */
    subscription: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string;
      accountEmail: string | null;
    } | null;
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
  anthropic: {
    url: "https://api.anthropic.com",
    model: "claude-opus-4-7",
    apiKey: "",
    authMode: "api_key",
    subscription: null
  },
  developerInstructions: ""
};

const CONFIG_STORAGE_KEY = "warpforge_ai_config";

function loadConfigFromStorage(): AiConfig {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AiConfig>;
      // Merge defaults at the per-provider level so older stored
      // configs (predating the anthropic + authMode fields) still pick
      // up the new defaults instead of becoming `undefined`.
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        anthropic: { ...DEFAULT_CONFIG.anthropic, ...(parsed.anthropic ?? {}) }
      };
    }
  } catch (error) {
    console.warn("Failed to load AI config from localStorage:", error);
  }
  return DEFAULT_CONFIG;
}

type ProviderKey = "ollama" | "comfyui" | "openai" | "anthropic";

function providerSettings(
  config: AiConfig,
  provider: string
): AiConfig[ProviderKey] | Record<string, never> {
  if (
    provider === "ollama" ||
    provider === "comfyui" ||
    provider === "openai" ||
    provider === "anthropic"
  ) {
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
  /** Pending Anthropic OAuth session, if a sign-in flow is in progress. */
  anthropicOauth: {
    sessionId: string;
    authorizeUrl: string;
  } | null;
  setProvider(provider: string): void;
  toggleSettings(): void;
  updateConfig(updates: Partial<AiConfig>): void;
  runPrompt(
    mode: AiMode,
    prompt: string,
    context?: Record<string, unknown>
  ): Promise<RunPromptResult>;
  testConnection(provider: string): Promise<void>;
  /** Kick off the Anthropic OAuth flow — opens the browser and returns
   *  the URL/session so the dialog can render a paste field. */
  startAnthropicSignIn(): Promise<{ authorizeUrl: string }>;
  /** Exchange a pasted `code#state` for tokens and persist them. */
  completeAnthropicSignIn(pastedCode: string): Promise<void>;
  /** Drop the saved subscription tokens (and pending session if any). */
  signOutAnthropic(): void;
}

export interface RunPromptResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}

/**
 * Resolve the credentials to send for the Anthropic provider, refreshing
 * the OAuth access token if it's near expiry. Returns the extra fields
 * the Tauri `ai_run_mode` request wants, or throws when the user hasn't
 * supplied/signed-in to anything.
 */
async function resolveAnthropicCreds(
  config: AiConfig,
  applyRefresh: (next: AnthropicOAuthTokens) => void,
): Promise<{ authMode: "api_key" | "subscription"; apiKey?: string; subscriptionToken?: string }> {
  const ant = config.anthropic;
  if (ant.authMode === "subscription") {
    let sub = ant.subscription;
    if (!sub) {
      throw new Error("Anthropic subscription auth selected but not signed in. Open AI Settings to sign in.");
    }
    // Refresh ~60 s ahead of expiry so a long-running request doesn't
    // race the token's lifetime.
    const expiresAtMs = Date.parse(sub.expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() < 60_000) {
      if (!sub.refreshToken) {
        throw new Error("Anthropic access token expired and no refresh token is stored. Sign in again.");
      }
      const refreshed = await anthropicOauthRefresh(sub.refreshToken);
      applyRefresh(refreshed);
      sub = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? sub.refreshToken,
        expiresAt: refreshed.expires_at,
        accountEmail: refreshed.account_email ?? sub.accountEmail,
      };
    }
    return { authMode: "subscription", subscriptionToken: sub.accessToken };
  }
  return { authMode: "api_key", apiKey: ant.apiKey };
}

export const useAiStore = create<AiStore>((set, get) => ({
  messages: [],
  provider: "ollama",
  busy: false,
  config: loadConfigFromStorage(),
  showSettings: false,
  connectionStatus: {},
  connectionError: {},
  anthropicOauth: null,

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

      // Anthropic gets the (possibly subscription-OAuth) credential
      // bundle resolved via the shared helper. Other providers stick to
      // the plain apiKey field.
      const anthropicCreds =
        provider === "anthropic"
          ? await resolveAnthropicCreds(config, (next) =>
              get().updateConfig({
                anthropic: {
                  ...config.anthropic,
                  subscription: {
                    accessToken: next.access_token,
                    refreshToken:
                      next.refresh_token ??
                      config.anthropic.subscription?.refreshToken ??
                      null,
                    expiresAt: next.expires_at,
                    accountEmail:
                      next.account_email ??
                      config.anthropic.subscription?.accountEmail ??
                      null,
                  },
                },
              }),
            )
          : null;

      const response = await aiRunMode({
        mode,
        prompt,
        provider,
        context: { test: true },
        providerUrl: 'url' in providerConfig ? providerConfig.url : undefined,
        model: 'model' in providerConfig ? providerConfig.model : undefined,
        apiKey: anthropicCreds
          ? anthropicCreds.apiKey
          : 'apiKey' in providerConfig ? providerConfig.apiKey : undefined,
        authMode: anthropicCreds?.authMode,
        subscriptionToken: anthropicCreds?.subscriptionToken,
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

      const anthropicCreds =
        provider === "anthropic"
          ? await resolveAnthropicCreds(config, (next) =>
              get().updateConfig({
                anthropic: {
                  ...config.anthropic,
                  subscription: {
                    accessToken: next.access_token,
                    refreshToken:
                      next.refresh_token ??
                      config.anthropic.subscription?.refreshToken ??
                      null,
                    expiresAt: next.expires_at,
                    accountEmail:
                      next.account_email ??
                      config.anthropic.subscription?.accountEmail ??
                      null,
                  },
                },
              }),
            )
          : null;

      const response = await aiRunMode({
        mode,
        prompt: finalPrompt,
        provider,
        context,
        providerUrl: 'url' in providerConfig ? providerConfig.url : undefined,
        model: 'model' in providerConfig ? providerConfig.model : undefined,
        apiKey: anthropicCreds
          ? anthropicCreds.apiKey
          : 'apiKey' in providerConfig ? providerConfig.apiKey : undefined,
        authMode: anthropicCreds?.authMode,
        subscriptionToken: anthropicCreds?.subscriptionToken,
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
  },

  async startAnthropicSignIn() {
    const { authorize_url, session_id } = await anthropicOauthStart();
    set({ anthropicOauth: { sessionId: session_id, authorizeUrl: authorize_url } });
    return { authorizeUrl: authorize_url };
  },

  async completeAnthropicSignIn(pastedCode) {
    const pending = get().anthropicOauth;
    if (!pending) {
      throw new Error("No Anthropic sign-in in progress — click Sign In first.");
    }
    const tokens = await anthropicOauthComplete(pending.sessionId, pastedCode);
    const { config } = get();
    get().updateConfig({
      anthropic: {
        ...config.anthropic,
        authMode: "subscription",
        subscription: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt: tokens.expires_at,
          accountEmail: tokens.account_email ?? null,
        },
      },
    });
    set({ anthropicOauth: null });
  },

  signOutAnthropic() {
    const { config } = get();
    get().updateConfig({
      anthropic: {
        ...config.anthropic,
        subscription: null,
        authMode: "api_key",
      },
    });
    set({ anthropicOauth: null });
  }
}));
