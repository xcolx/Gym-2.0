"use client";

import { FormPage, FormRow, FormSection, InputRow } from "@/components/ui/Form";

import { AuthButton, AuthHeader } from "./AuthParts";
import { useForgotPassword } from "./use-auth-forms";

/** Sends the link to the password reset page. The message is the same whether or not an account exists. */
export function ForgotPasswordView({
  email,
  setEmail,
  showLogin,
}: {
  email: string;
  setEmail: (email: string) => void;
  showLogin: () => void;
}) {
  const { isLoading, error, message, canSubmit, submit } = useForgotPassword(email);

  return (
    <FormPage title="Forgot Password" inline withoutTabBar>
      <form onSubmit={submit} className="contents">
        <FormSection plain>
          <AuthHeader
            title="Forgot your password?"
            subtitle="Enter your email and we'll send you a link to set a new password."
          />
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
        </FormSection>

        {(error || message) && (
          <FormSection>
            <FormRow>
              {error ? (
                <span className="text-[#ff3b30]">{error}</span>
              ) : (
                <span className="text-secondary-label">{message}</span>
              )}
            </FormRow>
          </FormSection>
        )}

        <FormSection>
          <AuthButton
            title="Send Reset Link"
            isLoading={isLoading}
            disabled={!canSubmit}
          />
        </FormSection>

        <FormSection plain>
          <button
            type="button"
            onClick={showLogin}
            className="w-full py-2.5 text-center text-app active:opacity-50"
          >
            Back to Log In
          </button>
        </FormSection>
      </form>
    </FormPage>
  );
}
