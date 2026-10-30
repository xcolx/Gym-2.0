import type { Metadata, Viewport } from "next";
import "./globals.css";

import { AppShell } from "@/components/shell/AppShell";
import { APP_COLOR_SCRIPT } from "@/lib/app-color";
import { SITE_URL } from "@/lib/site";
import { APP_THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  // The base of the canonical URLs and the Open Graph image (app/opengraph-image.tsx), also on a local server
  metadataBase: new URL(SITE_URL),
  title: "Gym 2.0",
  description: "Track your workouts, see which muscles you trained and get suggested workouts.",
  applicationName: "Gym 2.0",
  // For installing the app, see "PWA" in ARCHITECTURE.md
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Gym 2.0", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Switched to the forced appearance of Settings → Appearance by applyAppTheme (lib/theme.ts)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The app color of the user and the appearance of this device before the first paint, so neither flashes */}
        <script dangerouslySetInnerHTML={{ __html: APP_COLOR_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: APP_THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* Session, route guard (signed out → /auth), tab bar, update screens, appearance and service worker */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
