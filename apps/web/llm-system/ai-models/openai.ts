// llm-system/ai-models/openai.ts
// OpenAI Provider

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { match } from "ts-pattern";
import type { Message, AIOption } from "./types";

const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

function log(...args: any[]) {
  if (DEBUG) console.log("[openai-provider]", ...args);
}

// ===========================
// Configuration
// ===========================

export function getOpenAIConfig() {
  return {
    provider: "openai" as const,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY ?? "",
  };
}

export function validateOpenAIConfig(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey) {
    return {
      valid: false,
      error: "Missing OPENAI_API_KEY - make sure to add it to your .env file.",
    };
  }
  return { valid: true };
}

// ===========================
// Message Building
// ===========================

export function buildOpenAIMessages(
  prompt: string,
  option?: AIOption,
  command?: string
): Message[] {
  return match(option)
    .with("continue", () => [
      {
        role: "system" as const,
        content:
          "You are an AI writing assistant that continues existing text based on context from prior text. " +
          "Give more weight/priority to the later characters than the beginning ones. " +
          "Limit your response to no more than 200 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting when appropriate.",
      },
      { role: "user" as const, content: prompt },
    ])
    .with("improve", () => [
      {
        role: "system" as const,
        content:
          "You are an AI writing assistant that improves existing text. " +
          "Limit your response to no more than 200 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting when appropriate.",
      },
      { role: "user" as const, content: `The existing text is: ${prompt}` },
    ])
    .with("shorter", () => [
      {
        role: "system" as const,
        content:
          "You are an AI writing assistant that shortens existing text. " +
          "Use Markdown formatting when appropriate.",
      },
      { role: "user" as const, content: `The existing text is: ${prompt}` },
    ])
    .with("longer", () => [
      {
        role: "system" as const,
        content:
          "You are an AI writing assistant that lengthens existing text. " +
          "Use Markdown formatting when appropriate.",
      },
      { role: "user" as const, content: `The existing text is: ${prompt}` },
    ])
    .with("fix", () => [
      {
        role: "system" as const,
        content:
          "You are an AI writing assistant that fixes grammar and spelling errors in existing text. " +
          "Limit your response to no more than 200 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting when appropriate.",
      },
      { role: "user" as const, content: `The existing text is: ${prompt}` },
    ])
    .with("zap", () => [
      {
        role: "system" as const,
        content:
          "You are an AI writing assistant that generates text based on a prompt. " +
          "You take an input from the user and a command for manipulating the text. " +
          "Use Markdown formatting when appropriate.",
      },
      {
        role: "user" as const,
        content: `For this text: ${prompt}. You have to respect the command: ${command ?? ""}`,
      },
    ])
    .otherwise(() => [{ role: "user" as const, content: prompt }]);
}

// ===========================
// Main Generate Function
// ===========================

export async function callOpenAI(
  model: string,
  messages: Message[]
): Promise<Response> {
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage?.content) {
    return new Response("Missing message content.", { status: 400 });
  }

  log("Calling OpenAI with model:", model);

  const result = await streamText({
    prompt: lastMessage.content,
    maxTokens: 4096,
    temperature: 0.7,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    model: openai(model) as any,
  });

  return result.toDataStreamResponse();
}

/**
 * Generate response using OpenAI
 */
export async function generateWithOpenAI(
  prompt: string,
  option?: AIOption,
  command?: string
): Promise<Response> {
  const config = getOpenAIConfig();

  // Validate configuration
  const validation = validateOpenAIConfig(config.apiKey);
  if (!validation.valid) {
    return new Response(validation.error, { status: 400 });
  }

  // Build messages
  const messages = buildOpenAIMessages(prompt, option, command);

  if (!messages || messages.length === 0) {
    return new Response("No valid messages to send to the model.", { status: 400 });
  }

  console.log(`🤖 OpenAI | Model: ${config.model}`);

  return callOpenAI(config.model, messages);
}
