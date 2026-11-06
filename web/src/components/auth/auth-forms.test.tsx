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
  const showCheckEmail = vi.fn();
  const renderLogin = () =>
    render(
      <WithEmail
        view={(email, setEmail) => (
          <LoginView
            email={email}
            setEmail={setEmail}
            onBack={() => {}}
            showSignUp={() => {}}
            showForgotPassword={() => {}}
            showCheckEmail={showCheckEmail}
          />
        )}
      />,
    );

  it("logs in with the trimmed email once both fields are filled", async () => {
    auth.login.mockResolvedValue(undefined);
    renderLogin();
    const user = userEvent.setup();
    const submit = screen.getByRole("button", { name: "Log in" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await user.type(screen.getByPlaceholderText("Email"), " alice@example.com ");
    expect(submit.disabled).toBe(true);
    await user.type(screen.getByPlaceholderText("Password"), PASSWORD);
    await user.click(submit);

    expect(auth.login).toHaveBeenCalledWith("alice@example.com", PASSWORD);
  });

  it("shows the hint to verify the email if it isn't verified yet", async () => {
    auth.login.mockRejectedValue(
      new ApiError("server", { status: 403, code: "EmailVerificationError", message: "Verify your email first." }),
    );
    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Email"), "alice@example.com ");
    await user.type(screen.getByPlaceholderText("Password"), `${PASSWORD}{Enter}`);

    expect(showCheckEmail).toHaveBeenCalledWith("alice@example.com", "Verify your email first.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the other errors below the fields", async () => {
    auth.login.mockRejectedValue(new ApiError("server", { status: 401, code: "InvalidCredentialsError", message: "Wrong password." }));
    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Email"), "alice@example.com");
    await user.type(screen.getByPlaceholderText("Password"), `wrong{Enter}`);

    expect((await screen.findByRole("alert")).textContent).toBe("Wrong password.");
    expect(showCheckEmail).not.toHaveBeenCalled();
  });
});

describe("SignUpView", () => {
  const didSignUp = vi.fn();
  const renderSignUp = () =>
    render(
      <WithEmail
        view={(email, setEmail) => <SignUpView email={email} setEmail={setEmail} onBack={() => {}} showLogin={() => {}} didSignUp={didSignUp} />}
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
    const submit = screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement;

    await fillIn(user);
    expect(submit.disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "I'm at least 16 years old and accept the Terms of Use" }));
    expect(submit.disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "I accept the Privacy Policy" }));
    await user.click(submit);

    expect(auth.signUp).toHaveBeenCalledWith("alice@example.com", PASSWORD, "alice");
    expect(didSignUp).toHaveBeenCalledWith("alice@example.com", "Check your inbox.");
  });

  it("explains what is wrong with the username and ticks off the rules the password meets", async () => {
    renderSignUp();
    const user = userEvent.setup();

    await fillIn(user, { username: "al", repeat: "Other-Passw0rd" });

    expect(screen.getByText("Between 3 and 20 characters.")).toBeTruthy();
    const rules = screen.getAllByRole("listitem").map((rule) => rule.textContent);
    expect(rules).toEqual([
      "8 to 50 characters, met",
      "Two of: lowercase, uppercase, digits, symbols, met",
      "Passwords match, not met",
    ]);
  });

  it("shows the error of the server", async () => {
    auth.signUp.mockRejectedValue(new ApiError("server", { status: 409, code: "UsernameTakenError", message: "This username is taken." }));
    renderSignUp();
    const user = userEvent.setup();

    await fillIn(user);
    await user.click(screen.getByRole("checkbox", { name: "I'm at least 16 years old and accept the Terms of Use" }));
    await user.click(screen.getByRole("checkbox", { name: "I accept the Privacy Policy" }));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("This username is taken.")).toBeTruthy();
    expect(didSignUp).not.toHaveBeenCalled();
  });
});
