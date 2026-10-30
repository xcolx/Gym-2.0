// The same rules as the backend (backend/app/schemas/fields.py and auth.py) and the texts of the iOS app

import { passwordProblem } from "@/lib/domain/password-policy";

/** What the server would refuse about a username, null if it's fine or still empty */
export function usernameProblem(username: string): string | null {
  if (username === "") return null;
  // Characters as Swift counts them (grapheme clusters, close enough for ASCII names)
  const length = Array.from(username).length;
  if (length < 3 || length > 20) return "Between 3 and 20 characters.";
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
    return 'Username may only contain letters, numbers, "_", "." and "-".';
  }
  return null;
}

/** The problem of a new password and its confirmation (SignUpView, ChangePasswordView), null if it's fine or still empty */
export function newPasswordProblem(password: string, confirmation: string): string | null {
  if (password === "") return null;
  const problem = passwordProblem(password);
  if (problem) return problem;
  if (confirmation !== "" && confirmation !== password) return "The passwords don't match.";
  return null;
}

/** `trimmingCharacters(in: .whitespaces)` */
export function trimmed(text: string): string {
  return text.replace(/^[ \t]+|[ \t]+$/g, "");
}
