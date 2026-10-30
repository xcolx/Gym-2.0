"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import "./globals.css";

import { STATUS_PRIMARY_BUTTON, STATUS_SECONDARY_BUTTON, StatusScreen } from "@/components/shell/StatusScreen";
import { APP_COLOR_SCRIPT } from "@/lib/app-color";
import { HOME_ROUTE } from "@/lib/auth/routes";
import { APP_THEME_SCRIPT } from "@/lib/theme";

/**
 * An error of the root layout itself (the AppShell: session, database, sync). Replaces the whole document, so it has
 * its own <html> and <body> and works without the session: a reload starts the app again. The local data isn't touched.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("The app failed to render", error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Gym 2.0</title>
        {/* The appearance and app color of this device, like the root layout */}
        <script dangerouslySetInnerHTML={{ __html: APP_COLOR_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: APP_THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <main className="flex min-h-dvh flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
          <StatusScreen
            icon={TriangleAlert}
            title="Something went wrong"
            description={
              <>
                <p>Gym 2.0 could not be started. Your data on this device is kept.</p>
                {error.message && <p className="mt-2 text-footnote">{error.message}</p>}
              </>
            }
          >
            {/* A reload instead of `reset`: the AppShell starts the session and opens the database again */}
            <button type="button" onClick={() => window.location.reload()} className={STATUS_PRIMARY_BUTTON}>
              Reload
            </button>
            {/* A full navigation, the app has to start again */}
            <a href={HOME_ROUTE} className={STATUS_SECONDARY_BUTTON}>
              Go to Home
            </a>
          </StatusScreen>
        </main>
      </body>
    </html>
  );
}
