"use client";

import { Key, Mail } from "lucide-react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";

import { AuthMessage, AuthPage, AuthTextField } from "./AuthParts";
import { useForgotPassword } from "./use-auth-forms";

/** Sends the link to the password reset page. The message is the same whether or not an account exists. */
export function ForgotPasswordView({
  email,
  setEmail,
  onBack,
}: {
  email: string;
  setEmail: (email: string) => void;
  onBack: () => void;
}) {
  const { isLoading, error, message, canSubmit, submit } = useForgotPassword(email);

  return (
    <AuthPage
      icon={Key}
      title="Reset password"
      subtitle="Enter your email and we'll send you a link to set a new password."
      onBack={onBack}
      onSubmit={submit}
      bottom={
        <PrimaryButton type="submit" isLoading={isLoading} disabled={!canSubmit}>
          Send link
        </PrimaryButton>
      }
    >
      <AuthTextField
        icon={Mail}
        type="email"
        name="email"
        placeholder="Email"
        autoComplete="username"
        inputMode="email"
        enterKeyHint="send"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      {error ? <AuthMessage text={error} style="error" /> : message && <AuthMessage text={message} style="success" />}
    </AuthPage>
  );
}
