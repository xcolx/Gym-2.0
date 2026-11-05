"use client";

import { Lock, Mail, RotateCcwKey, User } from "lucide-react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { PRIVACY_ROUTE, TERMS_ROUTE } from "@/lib/auth/routes";

import { AuthCheckbox, AuthMessage, AuthPage, AuthSwitchLink, AuthTextField, PasswordRule } from "./AuthParts";
import { useSignUp } from "./use-auth-forms";

/**
 * Creating an account (SignUpView of AuthView.swift): email, username, password with its rules ticked off while
 * typing, and accepting the terms of use and the privacy policy
 */
export function SignUpView({
  email,
  setEmail,
  onBack,
  showLogin,
  didSignUp,
}: {
  email: string;
  setEmail: (email: string) => void;
  onBack: () => void;
  showLogin: () => void;
  didSignUp: (email: string, message: string) => void;
}) {
  const form = useSignUp(email, setEmail, didSignUp);
  const { usernameIssue, passwordRules, error, isLoading, canSubmit } = form;

  return (
    <AuthPage
      title="Create account"
      subtitle="Your workouts are saved to your account, so they're safe on every device."
      onBack={onBack}
      onSubmit={form.submit}
      bottom={
        <>
          <PrimaryButton type="submit" isLoading={isLoading} disabled={!canSubmit}>
            Create account
          </PrimaryButton>
          <AuthSwitchLink question="Already have an account?" action="Log in" onClick={showLogin} />
        </>
      }
    >
      <AuthTextField
        icon={Mail}
        type="email"
        name="email"
        placeholder="Email"
        autoComplete="email"
        inputMode="email"
        enterKeyHint="next"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <AuthTextField
        icon={User}
        name="username"
        placeholder="Username"
        autoComplete="username"
        enterKeyHint="next"
        value={form.username}
        onChange={(event) => form.setUsername(event.target.value)}
      />
      {usernameIssue && <AuthMessage text={usernameIssue} style="error" />}

      <AuthTextField
        icon={Lock}
        type="password"
        name="new-password"
        placeholder="Password"
        autoComplete="new-password"
        enterKeyHint="next"
        value={form.password}
        onChange={(event) => form.setPassword(event.target.value)}
      />
      <AuthTextField
        icon={RotateCcwKey}
        type="password"
        name="repeat-password"
        placeholder="Repeat password"
        autoComplete="new-password"
        enterKeyHint="done"
        value={form.passwordConfirmation}
        onChange={(event) => form.setPasswordConfirmation(event.target.value)}
      />

      <ul className="mb-2 flex flex-col gap-1.5 px-1" aria-label="Password rules">
        <PasswordRule title="8 to 50 characters" isMet={passwordRules.hasValidLength} />
        <PasswordRule title="Two of: lowercase, uppercase, digits, symbols" isMet={passwordRules.hasEnoughKinds} />
        <PasswordRule title="Passwords match" isMet={passwordRules.passwordsMatch} />
      </ul>

      <AuthCheckbox checked={form.acceptsTermsOfUse} onChange={form.setAcceptsTermsOfUse}>
        I&apos;m at least 16 years old and accept the{" "}
        <a href={TERMS_ROUTE} target="_blank" rel="noopener noreferrer" className="text-app hover:underline">
          Terms of Use
        </a>
      </AuthCheckbox>
      <AuthCheckbox checked={form.acceptsPrivacyPolicy} onChange={form.setAcceptsPrivacyPolicy}>
        I accept the{" "}
        <a href={PRIVACY_ROUTE} target="_blank" rel="noopener noreferrer" className="text-app hover:underline">
          Privacy Policy
        </a>
      </AuthCheckbox>

      {error && <AuthMessage text={error} style="error" />}
    </AuthPage>
  );
}
