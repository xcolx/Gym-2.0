"use client";

import { SquareArrowDown } from "lucide-react";
import { useState } from "react";

import { dismissUpdateNotice, useAppUpdate } from "@/lib/api/app-update";
import { applyUpdate } from "@/lib/pwa/service-worker";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/controls";

/**
 * Port of UpdateRequiredView.swift: shown instead of the app when the backend no longer supports this version (410).
 * The App Store of iOS is the new version of the web app here: the waiting service worker takes over and the page
 * reloads. The data on this device is kept and uploaded after the update.
 */
export function UpdateRequired() {
  const [isUpdating, setIsUpdating] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-5 p-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))] text-center">
      <div className="flex-1" />
      <SquareArrowDown size={64} strokeWidth={1.5} className="text-app" aria-hidden />
      <h1 className="text-title2 font-bold">Update required</h1>
      <p className="text-secondary-label">
        This version of Gym 2.0 is no longer supported. Please update the app to continue. Your data on this device is
        kept and uploaded after the update.
      </p>
      <div className="flex-1" />
      <button
        type="button"
        disabled={isUpdating}
        onClick={() => {
          setIsUpdating(true);
          void applyUpdate();
        }}
        className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[12px] bg-app px-4 text-headline font-semibold text-white active:opacity-60 disabled:opacity-60"
      >
        {isUpdating ? <Spinner className="text-white" /> : "Update"}
      </button>
    </main>
  );
}

/**
 * The "Update available" alert of RootView.swift: the API version is deprecated (`Deprecation` header) or a new
 * version of the web app is installed and waiting. At most once a day, see lib/api/app-update.ts.
 */
export function UpdateNotice() {
  const { showsUpdateNotice } = useAppUpdate();
  return (
    <Alert
      open={showsUpdateNotice}
      title="Update available"
      message="A new version of Gym 2.0 is available."
      onClose={dismissUpdateNotice}
      buttons={[
        { label: "Later", role: "cancel" },
        { label: "Update", isDefault: true, onSelect: () => void applyUpdate() },
      ]}
    />
  );
}
