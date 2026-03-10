// llm-system/ai-models/types.ts
// Shared types for AI providers

export type AIProvider = "openai" | "gemini";
export type AIOption = "continue" | "improve" | "shorter" | "longer" | "fix" | "zap";

export interface GenerateRequest {
  prompt: string;
  option?: AIOption;
  command?: string;
}

export interface ProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

export interface Message {
  role: "system" | "user";
  content: string;
}

export interface AIProviderResult {
  ok: boolean;
  status: number;
  raw?: string;
  json?: any;
}
