"use client";

import { Lock, Mail } from "lucide-react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";

import { AuthMessage, AuthPage, AuthSwitchLink, AuthTextField } from "./AuthParts";
import { useLogin } from "./use-auth-forms";

/** The login of AuthView.swift. An email that isn't verified yet shows the hint to verify it. */
export function LoginView({
  email,
  setEmail,
  onBack,
  showSignUp,
  showForgotPassword,
  showCheckEmail,
}: {
  email: string;
  setEmail: (email: string) => void;
  onBack: () => void;
  showSignUp: () => void;
  showForgotPassword: () => void;
  showCheckEmail: (email: string, message: string) => void;
}) {
  const { password, setPassword, isLoading, error, canSubmit, submit } = useLogin(email, showCheckEmail);

  return (
    <AuthPage
      title="Welcome back"
      subtitle="Log in to continue your training."
      onBack={onBack}
      onSubmit={submit}
      bottom={
        <>
          <PrimaryButton type="submit" isLoading={isLoading} disabled={!canSubmit}>
            Log in
          </PrimaryButton>
          <AuthSwitchLink question="New here?" action="Create an account" onClick={showSignUp} />
        </>
      }
    >
      <AuthTextField
        icon={Mail}
        type="email"
        name="email"
        placeholder="Email"
        autoComplete="username"
        inputMode="email"
        enterKeyHint="next"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <AuthTextField
        icon={Lock}
        type="password"
        name="password"
        placeholder="Password"
        autoComplete="current-password"
        enterKeyHint="go"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <button
        type="button"
        onClick={showForgotPassword}
        className="self-end text-subheadline font-medium text-app hover:underline active:opacity-50"
      >
        Forgot password?
      </button>

      {error && <AuthMessage text={error} style="error" />}
    </AuthPage>
  );
}
