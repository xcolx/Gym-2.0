"use client";

import { FormPage, FormRow, FormSection, InputRow } from "@/components/ui/Form";
import { Switch } from "@/components/ui/controls";
import { PRIVACY_ROUTE, TERMS_ROUTE } from "@/lib/auth/routes";

import { AuthButton, AuthHeader } from "./AuthParts";
import { useSignUp } from "./use-auth-forms";

/** Creating an account: email, username, password and accepting the terms of use and the privacy policy */
export function SignUpView({
  email,
  setEmail,
  showLogin,
  didSignUp,
}: {
  email: string;
  setEmail: (email: string) => void;
  showLogin: () => void;
  didSignUp: (email: string, message: string) => void;
}) {
  const form = useSignUp(email, setEmail, didSignUp);
  const { usernameIssue, passwordIssue, error, isLoading, canSubmit } = form;

  return (
    <FormPage title="Create Account" inline withoutTabBar>
      <form onSubmit={form.submit} className="contents">
        <FormSection plain>
          <AuthHeader
            title="Create an account"
            subtitle="Your workouts are saved to your account, so they are safe on every device."
          />
        </FormSection>

        <FormSection>
          <InputRow
            type="email"
            name="email"
            placeholder="Email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormSection>

        <FormSection footer={usernameIssue && <span className="text-[#ff3b30]">{usernameIssue}</span>}>
          <InputRow
            name="username"
            placeholder="Username"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={form.username}
            onChange={(event) => form.setUsername(event.target.value)}
          />
        </FormSection>

        <FormSection footer={passwordIssue && <span className="text-[#ff3b30]">{passwordIssue}</span>}>
          <InputRow
            type="password"
            name="new-password"
            placeholder="Password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => form.setPassword(event.target.value)}
          />
          <InputRow
            type="password"
            name="repeat-password"
            placeholder="Repeat password"
            autoComplete="new-password"
            value={form.passwordConfirmation}
            onChange={(event) => form.setPasswordConfirmation(event.target.value)}
          />
        </FormSection>

        <FormSection>
          <FormRow>
            <span className="flex-1">
              I&apos;m at least 16 years old and accept the{" "}
              <a href={TERMS_ROUTE} target="_blank" rel="noopener noreferrer" className="text-app">
                Terms of Use
              </a>
            </span>
            <Switch
              label="I'm at least 16 years old and accept the Terms of Use"
              checked={form.acceptsTermsOfUse}
              onChange={form.setAcceptsTermsOfUse}
            />
          </FormRow>
          <FormRow>
            <span className="flex-1">
              I accept the{" "}
              <a href={PRIVACY_ROUTE} target="_blank" rel="noopener noreferrer" className="text-app">
                Privacy Policy
              </a>
            </span>
            <Switch label="I accept the Privacy Policy" checked={form.acceptsPrivacyPolicy} onChange={form.setAcceptsPrivacyPolicy} />
          </FormRow>
        </FormSection>

        {error && (
          <FormSection>
            <FormRow>
              <span className="whitespace-pre-line text-[#ff3b30]">{error}</span>
            </FormRow>
          </FormSection>
        )}

        <FormSection>
          <AuthButton title="Create Account" isLoading={isLoading} disabled={!canSubmit} />
        </FormSection>

        <FormSection plain>
          <button type="button" onClick={showLogin} className="w-full py-2.5 text-center text-app active:opacity-50">
            Already have an account? Log in
          </button>
        </FormSection>
      </form>
    </FormPage>
  );
}
