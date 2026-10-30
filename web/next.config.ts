import type { NextConfig } from "next";

// /api/:path* is forwarded to BACKEND_URL/:path* by src/proxy.ts at runtime, not by a rewrite here, which `next build`
// would freeze. See "Backend proxy" in ARCHITECTURE.md.

const isDev = process.env.NODE_ENV !== "production";

// Everything the app loads comes from its own origin: the pages and chunks, /api (images included), /images and the
// service worker. Previews of picked photos and the muscle masks are blob: URLs. Links to other sites (GitHub, the
// privacy policy, mailto) are navigations, which the policy doesn't restrict.
// - script-src needs 'unsafe-inline': Next.js inlines the data of every page (self.__next_f) and the root layout the
//   theme and color scripts. Nonces would make every page dynamic and don't fit the precached HTML of the service
//   worker. `next dev` also needs 'unsafe-eval' (React's debugging) and ws: (hot reload).
// - style-src needs 'unsafe-inline' for the style attributes (e.g. the widths of the bars, the app color).
// HSTS, X-Content-Type-Options and Referrer-Policy are set by the reverse proxy for every host (homeserver-infra,
// security-headers), so they aren't repeated here.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// The features the app doesn't use are switched off. Kept: the wake lock (the screen stays on during a workout). The
// share sheet (export, share buttons) is allowed for the page itself by default, Chrome doesn't know a web-share
// feature. The photos of exercises are taken with <input capture>, which opens the camera app of the phone and doesn't
// need the camera feature.
const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "bluetooth=()",
  "serial=()",
  "hid=()",
  "midi=()",
  "display-capture=()",
  "browsing-topics=()",
  "screen-wake-lock=(self)",
].join(", ");

const nextConfig: NextConfig = {
  // For the production Docker image
  output: "standalone",

  // `next dev` opened as http://<name>.localhost:<port> (own cookies per name, e.g. for several local servers)
  allowedDevOrigins: ["*.localhost"],

  experimental: {
    // The proxy gets only the first 10 MB of a body by default. In production the reverse proxy refuses requests over
    // 20 MiB with 413 before they reach the server (gym2-body-limit in homeserver-infra), and the backend takes images
    // up to 20 MiB (IMAGE_MAX_UPLOAD_BYTES), so nothing larger has to get through here either.
    proxyClientMaxBodySize: "20mb",
  },

  async headers() {
    return [
      {
        // Every page and file of the web app, not /api/*: the proxy (src/proxy.ts) passes the backend's responses on
        // with the backend's headers
        source: "/((?!api(?:/|$)).*)",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
          // frame-ancestors for older browsers
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // Everything except the pages for search engines (INDEXED_ROUTES of lib/site.ts), robots.txt, the sitemap,
        // llms.txt, the Open Graph image and the icons (the image of the structured data): the pages of the app need an
        // account and are empty for a crawler (the AppShell renders nothing before it redirects to /auth). robots.txt
        // allows them, so crawlers see this header.
        source: "/((?!$|privacy$|tos$|api(?:/|$)|robots\\.txt$|sitemap\\.xml$|llms\\.txt$|opengraph-image|icons/).*)",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        // The service worker (written by scripts/generate-sw.mjs after the build) must never come from a cache, so a
        // new deployment is found with the next navigation
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
