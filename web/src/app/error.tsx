"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { STATUS_PRIMARY_BUTTON, STATUS_SECONDARY_BUTTON, StatusScreen } from "@/components/shell/StatusScreen";
import { Page } from "@/components/ui/Page";
import { HOME_ROUTE } from "@/lib/auth/routes";

/**
 * An error thrown while a page rendered, e.g. a `NotFoundError` of a row a sync removed or a `DbNotOpenError` while
 * the session switches. Shown in place of the page, inside the AppShell, so the tab bar and the sync keep working.
 * The local data isn't touched. Errors of the AppShell itself are shown by global-error.tsx.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("A page failed to render", error);
  }, [error]);

  return (
    <Page>
      <StatusScreen
        icon={TriangleAlert}
        title="Something went wrong"
        description={
          <>
            <p>This screen could not be shown. Your data on this device is kept.</p>
            {error.message && <p className="mt-2 text-footnote">{error.message}</p>}
          </>
        }
      >
        <button type="button" onClick={reset} className={STATUS_PRIMARY_BUTTON}>
          Try Again
        </button>
        <Link href={HOME_ROUTE} replace className={STATUS_SECONDARY_BUTTON}>
          Go to Home
        </Link>
      </StatusScreen>
    </Page>
  );
}
