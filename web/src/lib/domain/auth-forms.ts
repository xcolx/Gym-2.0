// When the forms of AuthView.swift can be sent, the rules of the fields are in lib/auth/validation.ts

import { newPasswordProblem, trimmed, usernameProblem } from "@/lib/auth/validation";

/** The login needs an email and a password and isn't sent twice */
export function canSubmitLogin(email: string, password: string, isLoading: boolean): boolean {
  return trimmed(email) !== "" && password !== "" && !isLoading;
}

/** The reset link needs an email and isn't requested twice */
export function canSubmitForgotPassword(email: string, isLoading: boolean): boolean {
  return trimmed(email) !== "" && !isLoading;
}

export interface SignUpForm {
  email: string;
  username: string;
  password: string;
  passwordConfirmation: string;
  acceptsTermsOfUse: boolean;
  acceptsPrivacyPolicy: boolean;
  isLoading: boolean;
}

export interface SignUpFormState {
  /** Shown below the username, null if it's fine or still empty */
  usernameIssue: string | null;
  /** Shown below the passwords, null if they're fine or still empty */
  passwordIssue: string | null;
  canSubmit: boolean;
}

/**
 * The problems of the sign up form and whether it can be sent: every field filled in, both passwords the same and
 * valid, a valid username and both the terms of use and the privacy policy accepted.
 */
export function signUpFormState(form: SignUpForm): SignUpFormState {
  const usernameIssue = usernameProblem(form.username);
  const passwordIssue = newPasswordProblem(form.password, form.passwordConfirmation);
  const canSubmit =
    trimmed(form.email) !== "" &&
    form.username !== "" &&
    form.password !== "" &&
    form.password === form.passwordConfirmation &&
    usernameIssue === null &&
    passwordIssue === null &&
    form.acceptsTermsOfUse &&
    form.acceptsPrivacyPolicy &&
    !form.isLoading;
  return { usernameIssue, passwordIssue, canSubmit };
}
