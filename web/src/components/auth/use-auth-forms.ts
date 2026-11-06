"use client";

import { useState, type FormEvent } from "react";

import { errorMessage, isApiError } from "@/lib/api";
import { forgotPassword, login, resendVerificationEmail, signUp } from "@/lib/auth";
import { trimmed } from "@/lib/auth/validation";
import { canSubmitForgotPassword, canSubmitLogin, signUpFormState } from "@/lib/domain/auth-forms";

/**
 * The login of AuthView.swift (LoginViewModel). An email that isn't verified yet shows the hint to verify it, which
 * offers to send the email again.
 */
export function useLogin(email: string, showCheckEmail: (email: string, message: string) => void) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = canSubmitLogin(email, password, isLoading);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    try {
      await login(trimmed(email), password);
    } catch (caught) {
      if (isApiError(caught) && caught.kind === "server" && caught.code === "EmailVerificationError") {
        showCheckEmail(trimmed(email), errorMessage(caught));
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { password, setPassword, isLoading, error, canSubmit, submit };
}

/** Creating an account (SignUpView of AuthView.swift) */
export function useSignUp(
  email: string,
  setEmail: (email: string) => void,
  didSignUp: (email: string, message: string) => void,
) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [acceptsTermsOfUse, setAcceptsTermsOfUse] = useState(false);
  const [acceptsPrivacyPolicy, setAcceptsPrivacyPolicy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { usernameIssue, passwordRules, canSubmit } = signUpFormState({
    email,
    username,
    password,
    passwordConfirmation,
    acceptsTermsOfUse,
    acceptsPrivacyPolicy,
    isLoading,
  });

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    try {
      const signUpEmail = trimmed(email);
      setEmail(signUpEmail);
      const message = await signUp(signUpEmail, password, username);
      didSignUp(signUpEmail, message);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  };

  return {
    username,
    setUsername,
    password,
    setPassword,
    passwordConfirmation,
    setPasswordConfirmation,
    acceptsTermsOfUse,
    setAcceptsTermsOfUse,
    acceptsPrivacyPolicy,
    setAcceptsPrivacyPolicy,
    isLoading,
    error,
    usernameIssue,
    passwordRules,
    canSubmit,
    submit,
  };
}

/** Requesting the link to the password reset page. The message is the same whether or not an account exists. */
export function useForgotPassword(email: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = canSubmitForgotPassword(email, isLoading);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await forgotPassword(trimmed(email)));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, error, message, canSubmit, submit };
}

export function useResendVerification(email: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const resend = async () => {
    setIsLoading(true);
    try {
      setResendMessage(await resendVerificationEmail(email));
    } catch (caught) {
      setResendMessage(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, resendMessage, resend };
}
