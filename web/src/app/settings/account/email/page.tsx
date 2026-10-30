"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormPage, FormSection, InputRow, LabeledRow } from "@/components/ui/Form";
import { SaveButton, SETTINGS_BACK } from "@/components/settings/SaveButton";
import { Alert } from "@/components/ui/Alert";
import { errorMessage, userApi } from "@/lib/api";
import { trimmed } from "@/lib/auth/validation";
import { useCurrentUser } from "@/lib/repo/hooks";
import type { User } from "@/types/models";

/** Port of ChangeEmailView (AccountSettingsView.swift) */
export default function ChangeEmailPage() {
  const user = useCurrentUser();
  if (!user) return null;
  return <ChangeEmail user={user} />;
}

function ChangeEmail({ user }: { user: User }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const newEmail = trimmed(email);
  const canSave =
    newEmail.includes("@") && newEmail.toLowerCase() !== user.email?.toLowerCase() && password.length >= 8 && !isSaving;

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await userApi.changeEmail(newEmail, password);
      setSentTo(newEmail);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormPage title="Email" inline back={SETTINGS_BACK}>
      <form onSubmit={save} className="contents">
        <FormSection
          footer={
            error ? (
              <span className="text-[#ff3b30]">{error}</span>
            ) : (
              "We send a confirmation link to the new email. Your email only changes once you open it, until then you keep logging in with the current one."
            )
          }
        >
          <LabeledRow label="Current" value={user.email ?? ""} />
          <InputRow
            type="email"
            name="email"
            placeholder="New email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <InputRow
            type="password"
            name="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormSection>
        <SaveButton isSaving={isSaving} disabled={!canSave} />
      </form>

      <Alert
        open={sentTo !== null}
        title="Confirm your new email"
        message={`We sent a link to ${sentTo}. Your email changes once you open it.`}
        onClose={() => setSentTo(null)}
        buttons={[{ label: "OK", isDefault: true, onSelect: () => router.push(SETTINGS_BACK.href) }]}
      />
    </FormPage>
  );
}
