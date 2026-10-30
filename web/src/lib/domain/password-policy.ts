// Port of ios/Gym 2.0/Core/Domain/PasswordPolicy.swift

/** What the server would refuse about a new password, null if it's fine */
export function passwordProblem(password: string): string | null {
  // The server counts code points
  const length = Array.from(password).length;
  if (length < 8) return "At least 8 characters.";
  if (length > 50) return "At most 50 characters.";
  const kinds = [
    /\p{Lowercase}/u.test(password),
    /\p{Uppercase}/u.test(password),
    /[0-9]/.test(password),
    /[^\p{L}\p{N}]/u.test(password),
  ].filter(Boolean).length;
  if (kinds < 2) return "Use at least two of: lowercase letters, uppercase letters, digits, special characters.";
  return null;
}
