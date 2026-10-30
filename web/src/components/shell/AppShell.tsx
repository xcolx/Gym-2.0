"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { TabBar } from "./TabBar";
import { UpdateNotice, UpdateRequired } from "./UpdateScreens";
import { OpenWorkoutAtLaunch } from "@/components/workout/OpenWorkoutAtLaunch";
import { useAppUpdate } from "@/lib/api/app-update";
import { applyAppColor, DEFAULT_APP_COLOR } from "@/lib/app-color";
import { AUTH_ROUTE, HOME_ROUTE, isOpenRoute, isPublicRoute, isSessionActive, startSession, useSession } from "@/lib/auth";
import { useDbState } from "@/lib/db";
import { listenForInstallPrompt } from "@/lib/pwa/install-prompt";
import { registerServiceWorker } from "@/lib/pwa/service-worker";
import { useUserSettings } from "@/lib/repo/hooks";
import { SyncRunner } from "@/lib/sync/SyncRunner";
import { useApplyAppTheme } from "@/lib/use-app-theme";

// As early as possible: Chrome offers the installation right after the page loaded
if (typeof window !== "undefined") listenForInstallPrompt();

/**
 * The root of the app (RootView.swift): starts the session, guards the routes and shows the update screens.
 * - signed out: only the public routes (/auth), every other route redirects there
 * - restoring or signed in: the app with the tab bar, once the database of the user is open; /auth redirects home
 * - the open routes (the landing page /, /privacy, /tos): the page alone for everyone, also while the session loads
 *   and when an update is required
 * - retired API version (410): only the update screen (UpdateRequiredView.swift)
 * Everywhere: the appearance of this device (AppTheme), the service worker (offline app, updates) and the update
 * notice.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const dbState = useDbState();
  const { isUpdateRequired } = useAppUpdate();

  useEffect(() => startSession(), []);
  useEffect(() => registerServiceWorker(), []);
  useApplyAppTheme();

  const isOpen = isOpenRoute(pathname);
  const isPublic = isPublicRoute(pathname);
  const isActive = isSessionActive(session);
  const redirectTo =
    session.status === "loading" || isOpen
      ? null
      : isPublic && isActive
        ? HOME_ROUTE
        : !isPublic && !isActive
          ? AUTH_ROUTE
          : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  // Signed out there are no settings: the login has the default color (AuthView.swift), not the last user's
  useEffect(() => {
    if (session.status === "signedOut") applyAppColor(DEFAULT_APP_COLOR);
  }, [session.status]);

  // Rendered on the server too, so the policy is readable without JavaScript and by crawlers
  if (isOpen) return children;
  if (isUpdateRequired) return <UpdateRequired />;
  if (session.status === "loading" || redirectTo) return null;

  if (isPublic)
    return (
      <>
        <UpdateNotice />
        {children}
      </>
    );

  if (dbState.status === "unavailable") return <StorageUnavailable message={dbState.message} />;
  // Opening takes a moment after the login or reload
  if (dbState.status !== "open") return null;

  return (
    <>
      <AppColor />
      <SyncRunner />
      <OpenWorkoutAtLaunch />
      <TabBar />
      <UpdateNotice />
      <div className="pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] md:pb-0 md:pl-[var(--sidebar-w)]">
        {children}
      </div>
    </>
  );
}

/** Applies the app color of the current user (`.tint(userSettings.appColor)` in MainView.swift) */
function AppColor() {
  const color = useUserSettings()?.schemeColor;
  useEffect(() => {
    if (color) applyAppColor(color);
  }, [color]);
  return null;
}

function StorageUnavailable({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-title font-bold">Storage unavailable</h1>
      <p className="max-w-md text-secondary-label">{message}</p>
      <button type="button" className="text-app" onClick={() => window.location.reload()}>
        Try again
      </button>
    </main>
  );
}
