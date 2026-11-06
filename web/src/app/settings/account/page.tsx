"use client";

import { AccountSections } from "@/components/settings/AccountSection";
import { SETTINGS_BACK } from "@/components/settings/SaveButton";
import { FormPage } from "@/components/ui/Form";
import { useCurrentUser } from "@/lib/repo/hooks";

/** Port of AccountView (AccountSettingsView.swift) */
export default function AccountPage() {
  const user = useCurrentUser();
  return (
    <FormPage title="Account" inline back={SETTINGS_BACK}>
      {user && <AccountSections user={user} />}
    </FormPage>
  );
}
