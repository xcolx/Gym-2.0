"use client";

import { useEffect, useState } from "react";

import { CheckEmailView } from "./CheckEmailView";
import { ForgotPasswordView } from "./ForgotPasswordView";
import { LoginView } from "./LoginView";
import { SignUpView } from "./SignUpView";
import { WelcomeView } from "./WelcomeView";

type Screen =
  /** The start, from which the others are opened */
  | { kind: "welcome" }
  | { kind: "login" }
  | { kind: "signUp" }
  | { kind: "forgotPassword" }
  /** After creating an account or logging in with an email that isn't verified yet */
  | { kind: "checkEmail"; email: string; message: string };

/**
 * Port of AuthView.swift. At most one screen is on top of the welcome screen: switching between the login and creating
 * an account replaces it, so going back always leads to the welcome screen. The screen on top has an entry in the
 * history, so the back button of the browser and the back gesture of Android go back as well. After the login the
 * AppShell redirects to /home.
 */
export function AuthScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: "welcome" });
  // Shared by the screens, like the email of AuthViewModel
  const [email, setEmail] = useState("");

  useEffect(() => {
    const backToWelcome = () => setScreen({ kind: "welcome" });
    window.addEventListener("popstate", backToWelcome);
    return () => window.removeEventListener("popstate", backToWelcome);
  }, []);

  const show = (next: Screen) => {
    if (screen.kind === "welcome") window.history.pushState(window.history.state, "");
    setScreen(next);
  };
  // Through the history, so the entry of the screen on top is gone as well
  const back = () => window.history.back();

  switch (screen.kind) {
    case "welcome":
      return <WelcomeView showSignUp={() => show({ kind: "signUp" })} showLogin={() => show({ kind: "login" })} />;
    case "login":
      return (
        <LoginView
          email={email}
          setEmail={setEmail}
          onBack={back}
          showSignUp={() => show({ kind: "signUp" })}
          showForgotPassword={() => show({ kind: "forgotPassword" })}
          showCheckEmail={(checkedEmail, message) => show({ kind: "checkEmail", email: checkedEmail, message })}
        />
      );
    case "signUp":
      return (
        <SignUpView
          email={email}
          setEmail={setEmail}
          onBack={back}
          showLogin={() => show({ kind: "login" })}
          didSignUp={(signedUpEmail, message) => show({ kind: "checkEmail", email: signedUpEmail, message })}
        />
      );
    case "forgotPassword":
      return <ForgotPasswordView email={email} setEmail={setEmail} onBack={back} />;
    case "checkEmail":
      return (
        <CheckEmailView email={screen.email} message={screen.message} onBack={back} showLogin={() => show({ kind: "login" })} />
      );
  }
}
