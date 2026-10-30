// Mirrors ios/Gym 2.0/Core/Networking/DTOs/AuthDTOs.swift and backend/app/schemas/auth.py

/**
 * Which app logged in: the iOS app is "mobile", the web app "web". The backend records it on the session and the user
 * (uses_ios, uses_web). Every client gets the same session lifetime (SESSION_* in backend/app/core/config.py).
 */
export type AuthClient = "web" | "mobile";

export interface AuthResponse {
  success: boolean;
  message: string;
}
