"use client";

import { AccountSection } from "@/components/settings/AccountSection";
import { FormPage } from "@/components/ui/Form";
import {
  AboutDeveloperSection,
  AppColorSection,
  AppearanceSection,
  BlockedUsersSection,
  BodyweightSection,
  InstallSection,
  ResyncSection,
  UnitsSection,
} from "@/components/settings/SettingsSections";
import { useBlockedUsers, useCurrentUser, useUserSettings } from "@/lib/repo/hooks";

/** Port of SettingsView.swift (without the import of the old iOS data, which only exists on iOS) */
export default function SettingsPage() {
  const settings = useUserSettings();
  const user = useCurrentUser();
  const blockedUsers = useBlockedUsers();

  if (!settings || user === undefined || !blockedUsers) return null;

  return (
    <FormPage title="Settings">
      {/* Can only be changed once the first sync loaded the current user */}
      <fieldset disabled={!settings.isAvailable} className={`contents ${settings.isAvailable ? "" : "[&_section]:opacity-60"}`}>
        <BodyweightSection settings={settings} />
        <UnitsSection settings={settings} />
        <AppColorSection settings={settings} />
        <BlockedUsersSection count={blockedUsers.length} disabled={!settings.isAvailable} />
      </fieldset>
      {/* Only stored on this device, so it can always be changed */}
      <AppearanceSection />
      {user && <AccountSection user={user} />}
      <ResyncSection />
      <InstallSection />
      <AboutDeveloperSection />
    </FormPage>
  );
}
