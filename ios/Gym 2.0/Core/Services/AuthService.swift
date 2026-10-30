//
//  AuthService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import Observation

/// Logs in and out against the backend and knows whether there is a session.
@MainActor
@Observable
final class AuthService {

    enum State: Equatable {
        /// A session token is stored but hasn't been checked yet (e.g. right after launch or while offline).
        case restoring
        case signedOut
        case signedIn
    }

    private(set) var state: State
    private(set) var currentUser: UserDTO?

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private let userService: UserService

    init(api: APIClient, userService: UserService) {
        self.api = api
        self.userService = userService
        state = api.hasSession ? .restoring : .signedOut

        api.onSessionEnded = { [weak self] in
            self?.didLoseSession()
        }
    }

    /// Checks the stored session at launch. Without a connection the session is kept and checked again next time.
    func restoreSession() async {
        guard api.hasSession else {
            state = .signedOut
            return
        }
        do {
            currentUser = try await userService.me()
            state = .signedIn
        } catch APIError.unauthorized {
            didLoseSession()
        } catch {
            // Offline or server error: the session may still be valid, so don't log the user out
        }
    }

    func login(email: String, password: String) async throws {
        try await api.send(.loginWithEmail(EmailLoginRequest(email: email, password: password)))
        currentUser = try? await userService.me()
        state = .signedIn
    }

    /// Creates the account and sends the verification email. The user can log in once the email is verified.
    /// Returns the message to show.
    func signUp(email: String, password: String, username: String) async throws -> String {
        let request = EmailSignUpRequest(email: email, password: password, username: username)
        return try await api.send(.signUpWithEmail(request), as: AuthResponse.self).message
    }

    /// Returns the message to show.
    func resendVerificationEmail(to email: String) async throws -> String {
        let request = ResendVerificationRequest(email: email)
        return try await api.send(.resendVerificationEmail(request), as: AuthResponse.self).message
    }

    /// Sends the email with the link to the password reset page. The message is the same whether or not
    /// an account exists for the email. Returns the message to show.
    func forgotPassword(email: String) async throws -> String {
        let request = ForgotPasswordRequest(email: email)
        return try await api.send(.forgotPassword(request), as: AuthResponse.self).message
    }

    /// Ends the session on the server. Locally the user is always logged out, also if the request fails.
    func logout() async {
        try? await api.send(.logout)
        api.clearSession()
        didLoseSession()
    }

    func refreshCurrentUser() async throws {
        currentUser = try await userService.me()
    }

    private func didLoseSession() {
        currentUser = nil
        state = .signedOut
    }
}

private extension Endpoint {
    static func loginWithEmail(_ request: EmailLoginRequest) -> Endpoint {
        Endpoint(method: .post, path: "/auth/login/email", body: .json(request))
    }

    static func signUpWithEmail(_ request: EmailSignUpRequest) -> Endpoint {
        Endpoint(method: .post, path: "/auth/signup/email", body: .json(request))
    }

    static func resendVerificationEmail(_ request: ResendVerificationRequest) -> Endpoint {
        Endpoint(method: .post, path: "/auth/verify-email/resend", body: .json(request))
    }

    static func forgotPassword(_ request: ForgotPasswordRequest) -> Endpoint {
        Endpoint(method: .post, path: "/auth/forgot-password", body: .json(request))
    }

    static let logout = Endpoint(method: .post, path: "/auth/logout")
}
