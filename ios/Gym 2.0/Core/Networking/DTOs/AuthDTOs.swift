//
//  AuthDTOs.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

// Mirrors backend/app/schemas/auth.py

/// Tells the backend which session lifetime to use. The app is always "mobile".
enum AuthClient: String, Encodable {
    case mobile
}

struct EmailLoginRequest: Encodable {
    var client: AuthClient = .mobile
    let email: String
    let password: String
}

struct EmailSignUpRequest: Encodable {
    var client: AuthClient = .mobile
    let email: String
    let password: String
    let username: String
}

struct ResendVerificationRequest: Encodable {
    let email: String
}

struct ForgotPasswordRequest: Encodable {
    let email: String
}

struct AuthResponse: Decodable {
    let success: Bool
    let message: String
}
