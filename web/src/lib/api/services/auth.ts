// The requests of ios/Gym 2.0/Core/Services/AuthService.swift. Features use lib/auth/session.ts instead.

import { send } from "../client";
import type { AuthClient, AuthResponse } from "../dto";

/** The backend records which app logged in (uses_web), see AuthClient in lib/api/dto/auth.ts */
const AUTH_CLIENT: AuthClient = "web";

export const authApi = {
  /** Sets the HTTP-only session cookie. Fails with 401 for wrong credentials, 403 if the email isn't verified yet. */
  loginWithEmail: (email: string, password: string) =>
    send<AuthResponse>({ method: "POST", path: "/auth/login/email", json: { client: AUTH_CLIENT, email, password } }),

  /** Creates the account and sends the verification email. The user can log in once the email is verified. */
  signUpWithEmail: (email: string, password: string, username: string) =>
    send<AuthResponse>({
      method: "POST",
      path: "/auth/signup/email",
      json: { client: AUTH_CLIENT, email, password, username },
    }),

  resendVerificationEmail: (email: string) =>
    send<AuthResponse>({ method: "POST", path: "/auth/verify-email/resend", json: { email } }),

  /**
   * Sends the email with the link to the password reset page of the backend. The response is the same whether or not
   * an account exists for the email.
   */
  forgotPassword: (email: string) => send<AuthResponse>({ method: "POST", path: "/auth/forgot-password", json: { email } }),

  /** Ends the session on the server and clears the cookie. */
  logout: () => send<AuthResponse>({ method: "POST", path: "/auth/logout" }),
};
