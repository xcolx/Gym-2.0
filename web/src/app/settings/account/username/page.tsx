"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormPage, FormSection, InputRow } from "@/components/ui/Form";
import { SaveButton, SETTINGS_BACK } from "@/components/settings/SaveButton";
import { errorMessage } from "@/lib/api";
import { refreshCurrentUser } from "@/lib/auth";
import { usernameProblem } from "@/lib/auth/validation";
import { useCurrentUser } from "@/lib/repo/hooks";
import { changeUsername } from "@/lib/repo/settings-feature";
import type { User } from "@/types/models";

/** Port of ChangeUsernameView (AccountSettingsView.swift) */
export default function ChangeUsernamePage() {
  const user = useCurrentUser();
  if (!user) return null;
  return <ChangeUsername user={user} />;
}

function ChangeUsername({ user }: { user: User }) {
  const router = useRouter();
  const [username, setUsername] = useState(user.username);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same rules as the backend (and the sign up)
  const problem = usernameProblem(username);
  const canSave = username !== "" && username !== user.username && problem === null && !isSaving;

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await changeUsername(user.serverId, username);
      await refreshCurrentUser().catch(() => undefined);
      router.push(SETTINGS_BACK.href);
    } catch (caught) {
      setError(errorMessage(caught));
      setIsSaving(false);
    }
  };

  const message = problem ?? error;
  return (
    <FormPage title="Username" inline back={SETTINGS_BACK}>
      <form onSubmit={save} className="contents">
        <FormSection
          footer={message ? <span className="text-[#ff3b30]">{message}</span> : "Your username can be changed once a minute."}
        >
          <InputRow
            name="username"
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </FormSection>
        <SaveButton isSaving={isSaving} disabled={!canSave} />
      </form>
    </FormPage>
  );
}
