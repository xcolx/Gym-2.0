// The same-origin proxy to the FastAPI backend: /api/:path* → BACKEND_URL/:path*. A proxy instead of a rewrite in
// next.config.ts, since `next build` resolves rewrites and would freeze BACKEND_URL into the build output. Not
// `NextResponse.rewrite()` either: Next.js answers a rewrite with the header x-middleware-rewrite, which would show the
// browser the internal URL of the backend. See "Backend proxy" in ARCHITECTURE.md.

import { NextResponse, type NextRequest } from "next/server";

import { backendTarget, backendUrl, forwardToBackend } from "@/lib/backend-proxy";

export function proxy(request: NextRequest) {
  const target = backendTarget(request.nextUrl.pathname, request.nextUrl.search, backendUrl());
  return target ? forwardToBackend(request, target) : NextResponse.next();
}

export const config = {
  matcher: ["/api", "/api/:path*"],
};
