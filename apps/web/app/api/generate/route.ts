// app/api/generate/route.ts
// Main API route with AI provider toggle

import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";
import {
  generate,
  getProviderConfig,
  validateProviderConfig,
  type AIOption,
} from "@/llm-system/ai-models";

export const runtime = "edge";

const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

function log(...args: any[]) {
  if (DEBUG) console.log("[api/generate]", ...args);
}

function getClientIp(req: Request): string {
  const header = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown";
  return header.split(",")[0]?.trim() || "unknown";
}

/**
 * Rate limiting (optional, requires KV config)
 */
async function checkRateLimit(req: Request): Promise<Response | null> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    log("Rate limit skipped (no KV config)");
    return null;
  }

  const ip = getClientIp(req);
  const ratelimit = new Ratelimit({ redis: kv, limiter: Ratelimit.slidingWindow(50, "1 d") });

  try {
    const { success, limit, reset, remaining } = await ratelimit.limit(`novel_ratelimit_${ip}`);
    log("Rate limit result:", { success, limit, reset, remaining });

    if (!success) {
      return new Response("You have reached your request limit for the day.", {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      });
    }
  } catch (e) {
    log("Rate limit check error, continuing:", e);
  }

  return null;
}

/**
 * Internal API key validation (for production)
 */
function validateInternalKey(req: Request): Response | null {
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  const incoming = req.headers.get("x-internal-api-key");
  const expected = process.env.INTERNAL_API_KEY;

  if (!expected || incoming !== expected) {
    log("Unauthorized: missing/invalid internal key");
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

/**
 * POST /api/generate
 * Main AI generation endpoint - toggles between OpenAI and Gemini
 */
export async function POST(req: Request): Promise<Response> {
  log("POST /api/generate called");

  // Auth check in production
  const authError = validateInternalKey(req);
  if (authError) return authError;

  // Log provider config
  const config = getProviderConfig();
  console.log(`🤖 Provider: ${config.provider.toUpperCase()} | Model: ${config.model}`);

  // Validate provider
  const validation = validateProviderConfig(config);
  if (!validation.valid) {
    console.log(validation.error);
    return new Response(validation.error, { status: 500 });
  }

  // Rate limiting
  const rateLimitError = await checkRateLimit(req);
  if (rateLimitError) return rateLimitError;

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  let { prompt, option, command } = body ?? {};
  log("Request:", { prompt, option, command });

  if (!prompt) {
    prompt = "";
  }

  // Generate using toggle system
  return generate({
    prompt,
    option: option as AIOption,
    command,
  });
}

/**
 * GET /api/generate
 * Health check and quick testing
 */
export async function GET(req: Request): Promise<Response> {
  log("GET /api/generate called");

  // Auth check in production
  const authError = validateInternalKey(req);
  if (authError) return authError;

  const config = getProviderConfig();
  const url = new URL(req.url);
  const prompt = url.searchParams.get("prompt");

  // Health check (no prompt)
  if (!prompt) {
    return new Response(
      JSON.stringify({
        ok: true,
        env: process.env.NODE_ENV ?? "development",
        provider: config.provider,
        model: config.model,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Validate provider
  const validation = validateProviderConfig(config);
  if (!validation.valid) {
    return new Response(validation.error, { status: 500 });
  }

  const option = (url.searchParams.get("option") ?? "zap") as AIOption;
  const command = url.searchParams.get("command") ?? "";

  // Generate using toggle system
  return generate({ prompt, option, command });
}
