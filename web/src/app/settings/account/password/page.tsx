"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormPage, FormSection, InputRow } from "@/components/ui/Form";
import { SaveButton, SETTINGS_BACK } from "@/components/settings/SaveButton";
import { Alert } from "@/components/ui/Alert";
import { errorMessage, userApi } from "@/lib/api";
import { newPasswordProblem } from "@/lib/auth/validation";
import { useCurrentUser } from "@/lib/repo/hooks";

/** Port of ChangePasswordView (AccountSettingsView.swift) */
export default function ChangePasswordPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showsSuccess, setShowsSuccess] = useState(false);

  const problem = newPasswordProblem(newPassword, passwordConfirmation);
  const canSave =
    currentPassword.length >= 8 && newPassword !== "" && newPassword === passwordConfirmation && problem === null && !isSaving;

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      // Ends all other sessions, the current one stays valid
      await userApi.changePassword(currentPassword, newPassword);
      setShowsSuccess(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const message = problem ?? error;
  return (
    <FormPage title="Password" inline back={SETTINGS_BACK}>
      <form onSubmit={save} className="contents">
        {/* For password managers: the account the password belongs to */}
        <input type="text" name="username" autoComplete="username" className="hidden" readOnly value={user?.email ?? ""} />
        <FormSection>
          <InputRow
            type="password"
            name="current-password"
            placeholder="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </FormSection>
        <FormSection
          footer={
            message ? (
              <span className="text-[#ff3b30]">{message}</span>
            ) : (
              "You stay logged in on this device and are logged out on all others."
            )
          }
        >
          <InputRow
            type="password"
            name="new-password"
            placeholder="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <InputRow
            type="password"
            name="repeat-new-password"
            placeholder="Repeat new password"
            autoComplete="new-password"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
          />
        </FormSection>
        <SaveButton isSaving={isSaving} disabled={!canSave} />
      </form>

      <Alert
        open={showsSuccess}
        title="Password changed"
        onClose={() => setShowsSuccess(false)}
        buttons={[{ label: "OK", isDefault: true, onSelect: () => router.push(SETTINGS_BACK.href) }]}
      />
    </FormPage>
  );
}
