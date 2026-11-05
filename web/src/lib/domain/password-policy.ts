// Port of ios/Gym 2.0/Core/Domain/PasswordPolicy.swift: the password rules of the backend (backend/app/core/security.py)

/** What the server would refuse about a new password, null if it's fine */
export function passwordProblem(password: string): string | null {
  // The server counts code points
  const length = Array.from(password).length;
  if (length < 8) return "At least 8 characters.";
  if (length > 50) return "At most 50 characters.";
  if (!hasEnoughKinds(password)) return "Use at least two of: lowercase letters, uppercase letters, digits, special characters.";
  return null;
}

/** Whether the password has 8 to 50 characters */
export function hasValidLength(password: string): boolean {
  const length = Array.from(password).length;
  return length >= 8 && length <= 50;
}

/** Whether the password has at least two of lowercase letters, uppercase letters, digits and special characters */
export function hasEnoughKinds(password: string): boolean {
  const kinds = [
    /\p{Lowercase}/u.test(password),
    /\p{Uppercase}/u.test(password),
    /[0-9]/.test(password),
    /[^\p{L}\p{N}]/u.test(password),
  ].filter(Boolean).length;
  return kinds >= 2;
}
