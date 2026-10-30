"use client";

import { useState, type FormEvent } from "react";

import { errorMessage, isApiError } from "@/lib/api";
import { forgotPassword, login, resendVerificationEmail, signUp } from "@/lib/auth";
import { trimmed } from "@/lib/auth/validation";
import { canSubmitForgotPassword, canSubmitLogin, signUpFormState } from "@/lib/domain/auth-forms";

/** The login of AuthView.swift, with resending the verification email when the email isn't verified yet */
export function useLogin(email: string) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const canSubmit = canSubmitLogin(email, password, isLoading);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    setEmailNotVerified(false);
    setResendMessage(null);
    try {
      await login(trimmed(email), password);
    } catch (caught) {
      setError(errorMessage(caught));
      if (isApiError(caught) && caught.kind === "server" && caught.code === "EmailVerificationError") setEmailNotVerified(true);
    } finally {
      setIsLoading(false);
    }
  };

  const resend = async () => {
    setIsLoading(true);
    try {
      setResendMessage(await resendVerificationEmail(trimmed(email)));
    } catch (caught) {
      setResendMessage(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  };

  return { password, setPassword, isLoading, error, emailNotVerified, resendMessage, canSubmit, submit, resend };
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

  const { usernameIssue, passwordIssue, canSubmit } = signUpFormState({
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
    passwordIssue,
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
