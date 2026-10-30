import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { STATUS_PRIMARY_BUTTON, StatusScreen } from "@/components/shell/StatusScreen";
import { Page } from "@/components/ui/Page";
import { HOME_ROUTE } from "@/lib/auth/routes";

/**
 * Unknown routes and `notFound()` of the pages, e.g. a workout or scheme that was deleted on another device while it
 * was open. Inside the AppShell, so the tab bar stays (signed-out users are sent to the login by the AppShell). The
 * service worker precaches it as the offline answer for unknown pages.
 */
export default function NotFound() {
  return (
    <Page>
      <StatusScreen
        icon={FileQuestion}
        title="Page Not Found"
        description="This page doesn't exist (anymore), e.g. because it was deleted on another device."
      >
        <Link href={HOME_ROUTE} replace className={STATUS_PRIMARY_BUTTON}>
          Go to Home
        </Link>
      </StatusScreen>
    </Page>
  );
}
