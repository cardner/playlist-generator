/**
 * AgentSelector Component
 * 
 * Component for selecting the playlist generation agent type (heuristic or LLM)
 * and configuring LLM provider settings. Handles secure API key storage and
 * provider selection.
 * 
 * Features:
 * - Agent type selection (heuristic or LLM)
 * - LLM provider selection (OpenAI, Gemini, Claude, Local)
 * - Secure API key input with show/hide toggle
 * - API key storage in encrypted localStorage
 * - API key validation and error display
 * - Provider-specific configuration
 * 
 * State Management:
 * - Manages selected provider and API key state
 * - Loads stored API keys on mount
 * - Handles API key saving and deletion
 * - Tracks loading and error states
 * 
 * Security:
 * - API keys are encrypted using AES-GCM before storage
 * - Keys are hashed using SHA-256
 * - Never transmitted except to selected provider
 * 
 * Props:
 * - `agentType`: Current agent type selection
 * - `llmConfig`: Current LLM configuration (if LLM selected)
 * - `onAgentTypeChange`: Callback when agent type changes
 * - `onLLMConfigChange`: Callback when LLM config changes
 * 
 * @module components/AgentSelector
 * 
 * @example
 * ```tsx
 * <AgentSelector
 *   agentType="llm"
 *   llmConfig={{ provider: "openai", apiKey: "..." }}
 *   onAgentTypeChange={(type) => setAgentType(type)}
 *   onLLMConfigChange={(config) => setLLMConfig(config)}
 * />
 * ```
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Bot, Sparkles, Key, AlertCircle } from "lucide-react";
import type { AgentType, LLMProvider, LLMConfig } from "@/types/playlist";
import { getApiKey, storeApiKey, hasApiKey, deleteApiKey } from "@/lib/api-key-storage";
import { logger } from "@/lib/logger";

interface AgentSelectorProps {
  agentType: AgentType;
  llmConfig?: LLMConfig;
  onAgentTypeChange: (type: AgentType) => void;
  onLLMConfigChange: (config: LLMConfig | undefined) => void;
}

const PROVIDER_OPTIONS: Array<{ value: LLMProvider; label: string; description: string }> = [
  { value: "openai", label: "OpenAI", description: "GPT-3.5, GPT-4, etc." },
  { value: "gemini", label: "Google Gemini", description: "Gemini Pro, Gemini Ultra" },
  { value: "claude", label: "Anthropic Claude", description: "Claude 3 Opus, Sonnet, Haiku" },
  { value: "local", label: "Local Service", description: "Ollama, LM Studio, etc." },
];

export function AgentSelector({
  agentType,
  llmConfig,
  onAgentTypeChange,
  onLLMConfigChange,
}: AgentSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(
    llmConfig?.provider || "openai"
  );
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load API key from storage when provider changes
  useEffect(() => {
    async function loadApiKey() {
      if (hasApiKey(selectedProvider)) {
        setIsLoading(true);
        try {
          const stored = await getApiKey(selectedProvider);
          if (stored) {
            setApiKey(stored);
          }
        } catch (err) {
          logger.error("Failed to load API key:", err);
        } finally {
          setIsLoading(false);
        }
      } else {
        setApiKey("");
      }
    }
    loadApiKey();
  }, [selectedProvider]);

  // Update LLM config when provider or API key changes
  // Use a ref to prevent infinite loops from callback recreation
  const prevConfigRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const newConfig = agentType === "llm" 
      ? { provider: selectedProvider, apiKey: apiKey || undefined }
      : undefined;
    
    // Create a stable string representation to compare
    const configKey = newConfig 
      ? `${newConfig.provider}:${newConfig.apiKey || ''}` 
      : 'undefined';
    
    // Only call callback if config actually changed
    if (prevConfigRef.current !== configKey) {
      prevConfigRef.current = configKey;
      if (agentType === "llm") {
        onLLMConfigChange({
          provider: selectedProvider,
          apiKey: apiKey || undefined,
        });
      } else {
        onLLMConfigChange(undefined);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentType, selectedProvider, apiKey]); // Removed onLLMConfigChange from deps to prevent infinite loop

  const handleApiKeyChange = async (value: string) => {
    setApiKey(value);
    setError(null);

    // Auto-save API key when user stops typing (debounced)
    if (value.trim()) {
      try {
        await storeApiKey(selectedProvider, value.trim());
      } catch (err) {
        logger.error("Failed to save API key:", err);
        setError("Failed to save API key");
      }
    } else {
      // Delete if empty
      deleteApiKey(selectedProvider);
    }
  };

  const handleProviderChange = (provider: LLMProvider) => {
    setSelectedProvider(provider);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* Agent Type Toggle */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Sparkles className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Generation Method
          </span>
        </label>
        <div className="flex gap-4 p-1 bg-app-hover rounded-sm border border-app-border">
          <button
            type="button"
            onClick={() => onAgentTypeChange("built-in")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-sm transition-colors ${
              agentType === "built-in"
                ? "bg-accent-primary text-white"
                : "text-app-secondary hover:text-app-primary hover:bg-app-surface"
            }`}
          >
            <Bot className="size-4" />
            <span className="font-medium text-sm">Built-in Agents</span>
          </button>
          <button
            type="button"
            onClick={() => onAgentTypeChange("llm")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-sm transition-colors ${
              agentType === "llm"
                ? "bg-accent-primary text-white"
                : "text-app-secondary hover:text-app-primary hover:bg-app-surface"
            }`}
          >
            <Sparkles className="size-4" />
            <span className="font-medium text-sm">LLM</span>
          </button>
        </div>
        <p className="text-app-tertiary text-xs mt-2">
          {agentType === "built-in"
            ? "Uses built-in algorithms for playlist generation (no API key required)"
            : "Uses AI language models for more creative playlist generation (requires API key)"}
        </p>
      </div>

      {/* LLM Configuration */}
      {agentType === "llm" && (
        <div className="space-y-4 p-4 bg-app-hover rounded-sm border border-app-border">
          {/* Provider Selection */}
          <div>
            <label className="flex items-center gap-2 text-app-primary mb-3">
              <Sparkles className="size-4 text-accent-primary" />
              <span className="font-medium uppercase tracking-wider text-xs">
                LLM Provider
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleProviderChange(option.value)}
                  className={`p-3 rounded-sm border transition-colors text-left ${
                    selectedProvider === option.value
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-app-border bg-app-surface hover:border-app-hover"
                  }`}
                >
                  <div className="font-medium text-sm text-app-primary mb-1">
                    {option.label}
                  </div>
                  <div className="text-xs text-app-tertiary">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* API Key Input */}
          <div>
            <label className="flex items-center gap-2 text-app-primary mb-3">
              <Key className="size-4 text-accent-primary" />
              <span className="font-medium uppercase tracking-wider text-xs">
                API Key
              </span>
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={`Enter ${PROVIDER_OPTIONS.find((o) => o.value === selectedProvider)?.label || "provider"} API key...`}
                disabled={isLoading}
                className="w-full px-4 py-3 pr-12 bg-app-surface text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-app-secondary hover:text-app-primary transition-colors"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {error && (
              <p className="text-red-500 text-sm flex items-center gap-1 mt-2">
                <AlertCircle className="size-4" />
                {error}
              </p>
            )}
            <p className="text-app-tertiary text-xs mt-2">
              Your API key is encrypted and stored locally. It will be used only for playlist generation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

