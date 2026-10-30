import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { LoginView } from "./LoginView";
import { SignUpView } from "./SignUpView";

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  signUp: vi.fn(),
  resendVerificationEmail: vi.fn(),
  forgotPassword: vi.fn(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<object>()), ...auth }));

const PASSWORD = "Test-Passw0rd";

beforeEach(() => {
  vi.resetAllMocks();
});

/** The views get the email from AuthScreen, which shares it between them */
function WithEmail({ view }: { view: (email: string, setEmail: (email: string) => void) => React.ReactNode }) {
  const [email, setEmail] = useState("");
  return <>{view(email, setEmail)}</>;
}

describe("LoginView", () => {
  const renderLogin = () =>
    render(
      <WithEmail
        view={(email, setEmail) => <LoginView email={email} setEmail={setEmail} showSignUp={() => {}} showForgotPassword={() => {}} />}
      />,
    );

  it("logs in with the trimmed email once both fields are filled", async () => {
    auth.login.mockResolvedValue(undefined);
    renderLogin();
    const user = userEvent.setup();
    const submit = screen.getByRole("button", { name: "Log In" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await user.type(screen.getByPlaceholderText("Email"), " alice@example.com ");
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByPlaceholderText("Password"), PASSWORD);
    await user.click(submit);

    expect(auth.login).toHaveBeenCalledWith("alice@example.com", PASSWORD);
  });

  it("shows the error and offers to resend the email if it isn't verified", async () => {
    auth.login.mockRejectedValue(
      new ApiError("server", { status: 403, code: "EmailVerificationError", message: "Verify your email first." }),
    );
    auth.resendVerificationEmail.mockResolvedValue("We sent you a new link.");
    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Email"), "alice@example.com");
    await user.type(screen.getByPlaceholderText("Password"), `${PASSWORD}{Enter}`);
    expect(await screen.findByText("Verify your email first.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Resend verification email" }));
    expect(auth.resendVerificationEmail).toHaveBeenCalledWith("alice@example.com");
    expect(await screen.findByText("We sent you a new link.")).toBeTruthy();
  });

  it("doesn't offer to resend the email for other errors", async () => {
    auth.login.mockRejectedValue(new ApiError("server", { status: 401, code: "InvalidCredentialsError", message: "Wrong password." }));
    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Email"), "alice@example.com");
    await user.type(screen.getByPlaceholderText("Password"), `wrong{Enter}`);

    expect(await screen.findByText("Wrong password.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
  });
});

describe("SignUpView", () => {
  const didSignUp = vi.fn();
  const renderSignUp = () =>
    render(
      <WithEmail
        view={(email, setEmail) => <SignUpView email={email} setEmail={setEmail} showLogin={() => {}} didSignUp={didSignUp} />}
      />,
    );

  async function fillIn(user: ReturnType<typeof userEvent.setup>, { username = "alice", repeat = PASSWORD } = {}) {
    await user.type(screen.getByPlaceholderText("Email"), "alice@example.com ");
    await user.type(screen.getByPlaceholderText("Username"), username);
    await user.type(screen.getByPlaceholderText("Password"), PASSWORD);
    await user.type(screen.getByPlaceholderText("Repeat password"), repeat);
  }

  it("creates the account once the form is valid and both documents are accepted", async () => {
    auth.signUp.mockResolvedValue("Check your inbox.");
    renderSignUp();
    const user = userEvent.setup();
    const submit = screen.getByRole("button", { name: "Create Account" }) as HTMLButtonElement;

    await fillIn(user);
    expect(submit.disabled).toBe(true);
    await user.click(screen.getByRole("switch", { name: "I'm at least 16 years old and accept the Terms of Use" }));
    expect(submit.disabled).toBe(true);
    await user.click(screen.getByRole("switch", { name: "I accept the Privacy Policy" }));
    await user.click(submit);

    expect(auth.signUp).toHaveBeenCalledWith("alice@example.com", PASSWORD, "alice");
    expect(didSignUp).toHaveBeenCalledWith("alice@example.com", "Check your inbox.");
  });

  it("explains what is wrong with the username and the password", async () => {
    renderSignUp();
    const user = userEvent.setup();

    await fillIn(user, { username: "al", repeat: "Other-Passw0rd" });

    expect(screen.getByText("Between 3 and 20 characters.")).toBeTruthy();
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
  });

  it("shows the error of the server", async () => {
    auth.signUp.mockRejectedValue(new ApiError("server", { status: 409, code: "UsernameTakenError", message: "This username is taken." }));
    renderSignUp();
    const user = userEvent.setup();

    await fillIn(user);
    await user.click(screen.getByRole("switch", { name: "I'm at least 16 years old and accept the Terms of Use" }));
    await user.click(screen.getByRole("switch", { name: "I accept the Privacy Policy" }));
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByText("This username is taken.")).toBeTruthy();
    expect(didSignUp).not.toHaveBeenCalled();
  });
});
