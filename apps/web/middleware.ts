import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // 1️⃣ Skip checks for static/public/auth routes
  if (
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/api/auth") ||
    request.nextUrl.pathname.startsWith("/api/public") || // Allow public API routes
    request.nextUrl.pathname.startsWith("/api/cms") ||
    request.nextUrl.pathname.startsWith("/api/covers") ||
    request.nextUrl.pathname.startsWith("/api/github/webhook") ||
    request.nextUrl.pathname.startsWith("/api/transcription/webhook") ||
    request.nextUrl.pathname.startsWith("/api/webhooks/google-calendar") || // Allow Google Calendar webhooks
    request.nextUrl.pathname.startsWith("/api/calendar") || // Allow calendar OAuth and sync
    request.nextUrl.pathname.startsWith("/api/cron") ||
    request.nextUrl.pathname.startsWith("/static") ||
    request.nextUrl.pathname.includes(".") ||// Skip files with extensions
    request.nextUrl.pathname.startsWith("/api/transcription/webhook") || // Allow Vexa webhooks 
    request.nextUrl.pathname.startsWith("/api/slack/callback") ||
    request.nextUrl.pathname.startsWith("/api/slack") // Allow callback, events, and interactions
  ) {
    return NextResponse.next();
  }

  // 2️⃣ Workspace redirection logic — only for root or dashboard home
  if (request.nextUrl.pathname === "/") {
    const workspace = request.cookies.get("workspace")?.value;
    if (workspace) {

      return NextResponse.redirect(
        new URL(`/notes`, request.url)
      );
    }

    // Redirect to workspace/getAll if cookie missing
    return NextResponse.redirect(new URL("/user", request.url));
  }

  // 3️⃣ API authentication check
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const sessionToken =
      request.cookies.get("next-auth.session-token")?.value ||
      request.cookies.get("__Secure-next-auth.session-token")?.value;

    const userEmail = request.headers.get("x-user-email");

    if (!sessionToken && !userEmail) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // 4️⃣ Default pass-through
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
