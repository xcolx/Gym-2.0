"use client";

import { LogoutSection } from "@/components/settings/AccountSection";
import { FormPage } from "@/components/ui/Form";
import {
  AboutSection,
  AccountCard,
  AppearanceSection,
  InstallSection,
  PrivacySection,
  TrainingSection,
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
      {user && <AccountCard user={user} />}
      {/* Can only be changed once the first sync loaded the current user */}
      <fieldset disabled={!settings.isAvailable} className={`contents ${settings.isAvailable ? "" : "[&_section]:opacity-60"}`}>
        <TrainingSection settings={settings} />
      </fieldset>
      <AppearanceSection settings={settings} />
      <PrivacySection blockedUsersCount={blockedUsers.length} disabled={!settings.isAvailable} />
      <InstallSection />
      <AboutSection />
      {user && <LogoutSection />}
    </FormPage>
  );
}
