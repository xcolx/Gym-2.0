"use client";

import { ButtonRow, FormPage, FormRow, FormSection, InputRow } from "@/components/ui/Form";

import { AuthButton, AuthHeader } from "./AuthParts";
import { useLogin } from "./use-auth-forms";

/** The login of AuthView.swift, with resending the verification email if the email isn't verified yet */
export function LoginView({
  email,
  setEmail,
  showSignUp,
  showForgotPassword,
}: {
  email: string;
  setEmail: (email: string) => void;
  showSignUp: () => void;
  showForgotPassword: () => void;
}) {
  const { password, setPassword, isLoading, error, emailNotVerified, resendMessage, canSubmit, submit, resend } = useLogin(email);

  return (
    <FormPage title="Log In" inline withoutTabBar>
      <form onSubmit={submit} className="contents">
        <FormSection plain>
          <AuthHeader title="Welcome back" subtitle="Log in to your Gym 2.0 account." />
        </FormSection>

        <FormSection>
          <InputRow
            type="email"
            name="email"
            placeholder="Email"
            autoComplete="username"
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

        {error && (
          <FormSection>
            <FormRow>
              <span className="text-[#ff3b30]">{error}</span>
            </FormRow>
            {emailNotVerified && (
              <ButtonRow disabled={isLoading} onClick={() => void resend()}>
                Resend verification email
              </ButtonRow>
            )}
            {resendMessage && (
              <FormRow>
                <span className="text-secondary-label">{resendMessage}</span>
              </FormRow>
            )}
          </FormSection>
        )}

        <FormSection>
          <AuthButton title="Log In" isLoading={isLoading} disabled={!canSubmit} />
        </FormSection>

        <FormSection plain>
          <button type="button" onClick={showForgotPassword} className="w-full py-2.5 text-center text-app active:opacity-50">
            Forgot password?
          </button>
          <button type="button" onClick={showSignUp} className="w-full py-2.5 text-center text-app active:opacity-50">
            Don&apos;t have an account? Create one
          </button>
        </FormSection>
      </form>
    </FormPage>
  );
}
