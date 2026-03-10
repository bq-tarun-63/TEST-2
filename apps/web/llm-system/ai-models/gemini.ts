// llm-system/ai-models/gemini.ts
// Gemini AI Provider

import { match } from "ts-pattern";
import type { Message, AIOption, AIProviderResult } from "./types";

const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

function log(...args: any[]) {
  if (DEBUG) console.log("[gemini-provider]", ...args);
}

// ===========================
// Configuration
// ===========================

export function getGeminiConfig() {
  return {
    provider: "gemini" as const,
    model: (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").replace(/^models\//, ""),
    apiKey: process.env.GEMINI_API_KEY ?? "",
  };
}

export function validateGeminiConfig(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey) {
    return {
      valid: false,
      error: "Missing GEMINI_API_KEY - make sure to add it to your .env file.",
    };
  }
  return { valid: true };
}

// ===========================
// Message Building
// ===========================

export function buildGeminiMessages(
  prompt: string,
  option?: AIOption,
  command?: string
): Message[] {
  return match(option)
    .with("continue", () => [{ role: "user" as const, content: String(prompt) }])
    .with("improve", () => [{ role: "user" as const, content: `Improve: ${String(prompt)}` }])
    .with("shorter", () => [{ role: "user" as const, content: `Shorten: ${String(prompt)}` }])
    .with("longer", () => [{ role: "user" as const, content: `Lengthen: ${String(prompt)}` }])
    .with("fix", () => [{ role: "user" as const, content: `Fix grammar/spelling: ${String(prompt)}` }])
    .with("zap", () => [
      {
        role: "user" as const,
        content: `For this text: ${String(prompt)}. Respect the command: ${String(command ?? "")}`,
      },
    ])
    .otherwise(() => [{ role: "user" as const, content: String(prompt) }]);
}

// ===========================
// API Call
// ===========================

async function fetchGemini(
  model: string,
  apiKey: string,
  text: string
): Promise<AIProviderResult> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const payload = {
    contents: [{ parts: [{ text }] }],
  };

  log("Calling Gemini endpoint:", endpoint);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch (e) {
    json = { parse_error: String(e), raw };
  }

  return { ok: res.ok, status: res.status, raw, json };
}

// ===========================
// Response Extraction
// ===========================

function extractTextFromGenerateContent(resp: any): string | null {
  if (!resp) return null;

  // Standard shape: { candidates: [ { content: { parts: [ { text: "..." } ] } } ] }
  if (Array.isArray(resp.candidates) && resp.candidates.length > 0) {
    const c = resp.candidates[0];

    if (Array.isArray(c.content)) {
      for (const piece of c.content) {
        if (piece && typeof piece.text === "string") return piece.text;
        if (typeof piece === "string") return piece;
      }
    }

    if (c.content?.parts && Array.isArray(c.content.parts)) {
      for (const part of c.content.parts) {
        if (part.text) return part.text;
      }
    }

    if (typeof c.output === "string") return c.output;
    if (typeof c.content === "string") return c.content;
  }

  // Output array shape
  if (Array.isArray(resp.output) && resp.output.length > 0) {
    const out = resp.output[0];
    if (typeof out === "string") return out;
    if (out?.content && typeof out.content === "string") return out.content;
    if (Array.isArray(out?.content) && out.content[0]?.text) return out.content[0].text;
  }

  // Fallback: shallow search
  try {
    const stack: any[] = [resp];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (typeof node === "string") return node;
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; --i) stack.push(node[i]);
        continue;
      }
      if (typeof node === "object") {
        for (const k of Object.keys(node)) {
          const v = (node as any)[k];
          if (typeof v === "string") return v;
          if (typeof v === "object") stack.push(v);
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// ===========================
// Main Generate Function
// ===========================

export async function callGemini(
  model: string,
  apiKey: string,
  messages: Message[]
): Promise<Response> {
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage?.content) {
    return new Response("Missing message content.", { status: 400 });
  }

  log("Calling Gemini with model:", model);

  try {
    const attempt = await fetchGemini(model, apiKey, lastMessage.content);

    if (!attempt.ok) {
      log("Gemini returned non-ok status:", attempt.status, "raw:", attempt.raw);

      if (attempt.status === 401 || attempt.status === 403) {
        return new Response(`Gemini authentication error: ${attempt.status} ${attempt.raw}`, { status: 502 });
      } else if (attempt.status === 404) {
        return new Response(`Gemini model not found (404). Response: ${attempt.raw}`, { status: 502 });
      } else {
        return new Response(`Gemini API error: ${attempt.status} ${attempt.raw}`, { status: 502 });
      }
    }

    const generated = extractTextFromGenerateContent(attempt.json) ?? JSON.stringify(attempt.json ?? {}, null, 2);
    log("Generated text (truncated):", typeof generated === "string" ? generated.slice(0, 1000) : generated);

    return new Response(String(generated), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err: any) {
    log("Exception while calling Gemini:", err);
    return new Response(`Failed to call Gemini API: ${String(err?.message ?? err)}`, { status: 500 });
  }
}

/**
 * Generate response using Gemini
 */
export async function generateWithGemini(
  prompt: string,
  option?: AIOption,
  command?: string
): Promise<Response> {
  const config = getGeminiConfig();

  // Validate configuration
  const validation = validateGeminiConfig(config.apiKey);
  if (!validation.valid) {
    return new Response(validation.error, { status: 400 });
  }

  // Build messages
  const messages = buildGeminiMessages(prompt, option, command);

  if (!messages || messages.length === 0) {
    return new Response("No valid messages to send to the model.", { status: 400 });
  }

  console.log(`🤖 Gemini | Model: ${config.model}`);

  return callGemini(config.model, config.apiKey, messages);
}
