import { App } from "octokit";
import { Octokit } from "@octokit/rest";
import crypto from "crypto";
import dotenv from "dotenv";

// Ensure .env is loaded
dotenv.config();

const appId = process.env.GITHUB_APP_ID;
const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
// const defaultInstallationId = process.env.GITHUB_APP_INSTALLATION_ID
//   ? Number(process.env.GITHUB_APP_INSTALLATION_ID)
//   : undefined; for development
const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET || "";



const normalizedPrivateKey = privateKeyRaw?.includes("\\n")
  ? privateKeyRaw.replace(/\\n/g, "\n")
  : privateKeyRaw;

const githubApp =
  appId && normalizedPrivateKey
    ? new App({
      appId: Number(appId),
      privateKey: normalizedPrivateKey,
    })
    : null;

function ensureAppConfigured() {
  if (!githubApp) {
    throw new Error("GitHub App is not configured. Check app ID/private key env vars.");
  }
}

export const GitHubAppService = {
  async getInstallationAccessToken(installationId?: number): Promise<string> {
    ensureAppConfigured();
    const resolvedInstallationId = installationId;
    if (!resolvedInstallationId) {
      throw new Error("Installation ID is required to request an access token.");
    }
    const octokit = await githubApp!.getInstallationOctokit(resolvedInstallationId);
    const authResult = (await octokit.auth({
      type: "installation",
    })) as { token: string } | { token?: undefined };
    if (!authResult.token) {
      throw new Error("Unable to retrieve installation token.");
    }
    return authResult.token;
  },

  async getOctokitForInstallation(installationId?: number): Promise<Octokit> {
    const token = await this.getInstallationAccessToken(installationId);
    return new Octokit({ auth: token });
  },

  verifyWebhookSignature(payload: string, signature?: string | null): boolean {
    const runtimeSecret = process.env.GITHUB_APP_WEBHOOK_SECRET || webhookSecret;
    const secretToUse = runtimeSecret || webhookSecret;

    if (!secretToUse) {
      console.error("GitHub webhook secret missing; rejecting webhook.");
      return false;
    }
    if (!signature) {
      return false;
    }

    const hmac = crypto.createHmac("sha256", secretToUse);
    const digest = `sha256=${hmac.update(payload).digest("hex")}`;

    if (digest.length !== signature.length) {
      return false;
    }

    // Convert strings to buffers for proper comparison
    // Both signature and digest are hex strings prefixed with "sha256="
    const signatureBuffer = new Uint8Array(Buffer.from(signature));
    const digestBuffer = new Uint8Array(Buffer.from(digest));

    if (signatureBuffer.byteLength !== digestBuffer.byteLength) {
      return false;
    }

    const isValid = crypto.timingSafeEqual(signatureBuffer, digestBuffer);
    return isValid;
  },
};

export default GitHubAppService;

