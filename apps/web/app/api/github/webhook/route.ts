import { NextRequest, NextResponse } from "next/server";
import { GitHubAppService } from "@/services/githubAppService";
import { GitHubIntegrationService } from "@/services/githubIntegrationService";
import type { InstallationSummary } from "@/models/types/GitHubConnection";

export async function POST(req: NextRequest) {
    const signature = req.headers.get("x-hub-signature-256");
    const event = req.headers.get("x-github-event");
    const delivery = req.headers.get("x-github-delivery");
    const payloadText = await req.text();

    // Debug logging
    const hasSecret = !!process.env.GITHUB_APP_WEBHOOK_SECRET;
    console.log(`[GitHub Webhook] Debug:`, {
        hasSecret,
        secretLength: process.env.GITHUB_APP_WEBHOOK_SECRET?.length || 0,
        hasSignature: !!signature,
        signaturePrefix: signature?.substring(0, 10),
        event,
        delivery,
        payloadLength: payloadText.length,
    });

    if (!GitHubAppService.verifyWebhookSignature(payloadText, signature)) {
        console.error(`[GitHub Webhook] Signature verification failed.`, {
            hasSecret,
            hasSignature: !!signature,
            signature: signature?.substring(0, 20) + "...",
        });
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    if (!event) {
        return NextResponse.json({ error: "Missing event header" }, { status: 400 });
    }

    const payload = JSON.parse(payloadText);
    console.log(`[GitHub Webhook] Event=${event} Action=${payload.action} Delivery=${delivery}`);

    try {
        const getAccountLogin = () =>
            typeof payload.installation?.account?.login === "string"
                ? payload.installation.account.login
                : typeof payload.installation?.account?.name === "string"
                    ? payload.installation.account.name
                    : "";

        switch (event) {
            case "installation": {
                const installation: InstallationSummary = {
                    id: payload.installation.id,
                    accountId: payload.installation.account?.id ?? 0,
                    accountLogin: getAccountLogin(),
                    repositorySelection: payload.installation.repository_selection,
                    targetType: payload.installation.target_type,
                    suspendedAt: payload.installation.suspended_at
                        ? new Date(payload.installation.suspended_at)
                        : undefined,
                };
                if (payload.action === "deleted") {
                    await GitHubIntegrationService.removeInstallation(installation.id);
                } else {
                    await GitHubIntegrationService.updateInstallations(installation);
                }
                break;
            }
            case "installation_repositories": {
                const installation: InstallationSummary = {
                    id: payload.installation.id,
                    accountId: payload.installation.account?.id ?? 0,
                    accountLogin: getAccountLogin(),
                    repositorySelection: payload.installation.repository_selection,
                    targetType: payload.installation.target_type,
                };
                await GitHubIntegrationService.updateInstallations(installation);
                break;
            }
            case "pull_request": {
                // Handle PR events: opened, closed, merged, synchronize, etc.
                if (payload.action && ["opened", "closed", "reopened", "synchronize", "ready_for_review"].includes(payload.action)) {
                    const pr = payload.pull_request;
                    const owner = payload.repository.owner.login;
                    const repo = payload.repository.name;
                    const pullNumber = pr.number;
                    const merged = Boolean(pr.merged_at);
                    const state = pr.state; // "open" or "closed"
                    const installationId = payload.installation?.id;

                    console.log(
                        `[GitHub Webhook] PR ${owner}/${repo}#${pullNumber} ${payload.action} - state: ${state}, merged: ${merged}`,
                    );

                    // Find all notes that have this PR linked and update their status
                    const result = await GitHubIntegrationService.syncPrStatusToNotes({
                        owner,
                        repo,
                        pullNumber,
                        state: state as "open" | "closed",
                        merged,
                        installationId,
                    });
                }
                break;
            }
            default:
                console.log(`[GitHub Webhook] Unhandled event type: ${event}`);
                break;
        }
    } catch (error) {
        console.error("Error handling GitHub webhook:", error);
        return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}


