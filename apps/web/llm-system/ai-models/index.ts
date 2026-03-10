// llm-system/ai-models/index.ts
// Main AI Provider Toggle System

import { generateWithGemini, getGeminiConfig } from "./gemini";
import { generateWithOpenAI, getOpenAIConfig } from "./openai";
import type { AIProvider, AIOption, ProviderConfig, GenerateRequest } from "./types";

// Re-export types and individual providers
export * from "./types";
export * from "./gemini";
export * from "./openai";

const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

function log(...args: any[]) {
  if (DEBUG) console.log("[ai-models]", ...args);
}

// ===========================
// Provider Toggle Logic
// ===========================

/**
 * Get the current AI provider from environment variables.
 * 
 * Usage in .env:
 *   DEFAULT_AI_MODEL=openai    → Uses OpenAI
 *   DEFAULT_AI_MODEL=gemini    → Uses Gemini (default)
 */
export function getCurrentProvider(): AIProvider {
  const provider = (process.env.DEFAULT_AI_MODEL?.toLowerCase() ?? "gemini") as AIProvider;
  log("Current provider:", provider);
  return provider;
}

/**
 * Get the full provider configuration based on DEFAULT_AI_MODEL
 */
export function getProviderConfig(): ProviderConfig {
  const provider = getCurrentProvider();

  if (provider === "openai") {
    const config = getOpenAIConfig();
    return {
      provider: "openai",
      model: config.model,
      apiKey: config.apiKey,
    };
  }

  const config = getGeminiConfig();
  return {
    provider: "gemini",
    model: config.model,
    apiKey: config.apiKey,
  };
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: ProviderConfig): { valid: boolean; error?: string } {
  if (!config.apiKey) {
    const keyName = config.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
    return {
      valid: false,
      error: `Missing ${keyName} - make sure to add it to your .env file.`,
    };
  }
  return { valid: true };
}

// ===========================
// Main Generate Function
// ===========================

/**
 * Generate AI response using the configured provider.
 * Automatically routes to OpenAI or Gemini based on DEFAULT_AI_MODEL env variable.
 */
export async function generate(request: GenerateRequest): Promise<Response> {
  const provider = getCurrentProvider();

  log("Generating with provider:", provider);
  console.log(`🔄 AI Toggle: Using ${provider.toUpperCase()}`);

  if (provider === "openai") {
    return generateWithOpenAI(request.prompt, request.option, request.command);
  }

  return generateWithGemini(request.prompt, request.option, request.command);
}
