"use client";

import { useState } from "react";

import { CheckEmailView } from "./CheckEmailView";
import { ForgotPasswordView } from "./ForgotPasswordView";
import { LoginView } from "./LoginView";
import { SignUpView } from "./SignUpView";

type Screen =
  | { kind: "login" }
  | { kind: "signUp" }
  | { kind: "forgotPassword" }
  /** After creating an account, until the user goes back to the login */
  | { kind: "checkEmail"; email: string; message: string };

/** Port of AuthView.swift. After the login the AppShell redirects to /home. */
export function AuthScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: "login" });
  // Shared by the login and the sign up, like the @State of AuthView
  const [email, setEmail] = useState("");

  switch (screen.kind) {
    case "login":
      return (
        <LoginView
          email={email}
          setEmail={setEmail}
          showSignUp={() => setScreen({ kind: "signUp" })}
          showForgotPassword={() => setScreen({ kind: "forgotPassword" })}
        />
      );
    case "signUp":
      return (
        <SignUpView
          email={email}
          setEmail={setEmail}
          showLogin={() => setScreen({ kind: "login" })}
          didSignUp={(signedUpEmail, message) => setScreen({ kind: "checkEmail", email: signedUpEmail, message })}
        />
      );
    case "forgotPassword":
      return <ForgotPasswordView email={email} setEmail={setEmail} showLogin={() => setScreen({ kind: "login" })} />;
    case "checkEmail":
      return <CheckEmailView email={screen.email} message={screen.message} showLogin={() => setScreen({ kind: "login" })} />;
  }
}
