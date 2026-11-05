//
//  AuthViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation

/// The screen shown while signed out and the email, which the screens share
@MainActor
@Observable
final class AuthViewModel {

    enum Screen: Hashable {
        /// The start, from which the others are opened
        case welcome
        case login
        case signUp
        case forgotPassword
        /// After creating an account or logging in with an email that isn't verified yet
        case checkEmail(email: String, message: String)
    }

    @ObservationIgnored let auth: any AuthServicing

    var screen: Screen = .welcome
    var email = ""

    init(auth: any AuthServicing) {
        self.auth = auth
    }

    var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespaces)
    }

    func show(_ screen: Screen) {
        self.screen = screen
    }

    /// Shows the hint to verify the email of the new account
    func didSignUp(message: String) {
        screen = .checkEmail(email: email, message: message)
    }
}

// MARK: - Login

@MainActor
@Observable
final class LoginViewModel {

    let session: AuthViewModel

    var password = ""
    var isLoading = false
    var errorMessage: String?

    init(session: AuthViewModel) {
        self.session = session
    }

    var email: String {
        get { session.email }
        set { session.email = newValue }
    }

    var canSubmit: Bool {
        !session.trimmedEmail.isEmpty && !password.isEmpty && !isLoading
    }

    func login() async {
        guard canSubmit else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await session.auth.login(email: session.trimmedEmail, password: password)
        } catch {
            // The verification hint offers to send the email again
            if case .server(_, "EmailVerificationError"?, _) = error as? APIError {
                session.show(.checkEmail(email: session.trimmedEmail, message: error.localizedDescription))
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - Sign up

@MainActor
@Observable
final class SignUpViewModel {

    let session: AuthViewModel

    var username = ""
    var password = ""
    var passwordConfirmation = ""
    var acceptsTermsOfUse = false
    var acceptsPrivacyPolicy = false
    var isLoading = false
    var errorMessage: String?

    init(session: AuthViewModel) {
        self.session = session
    }

    var email: String {
        get { session.email }
        set { session.email = newValue }
    }

    // Same rules as the backend (backend/app/schemas/fields.py and auth.py)
    var usernameProblem: String? {
        if username.isEmpty { return nil }
        if !(3...20).contains(username.count) { return "Between 3 and 20 characters." }
        if username.contains(where: { !($0.isASCII && ($0.isLetter || $0.isNumber || "_.-".contains($0))) }) {
            return "Username may only contain letters, numbers, \"_\", \".\" and \"-\"."
        }
        return nil
    }

    var passwordHasValidLength: Bool {
        PasswordPolicy.hasValidLength(password)
    }

    var passwordHasEnoughKinds: Bool {
        PasswordPolicy.hasEnoughKinds(password)
    }

    var passwordsMatch: Bool {
        !password.isEmpty && password == passwordConfirmation
    }

    var passwordProblem: String? {
        if password.isEmpty { return nil }
        if let problem = PasswordPolicy.problem(with: password) { return problem }
        if !passwordConfirmation.isEmpty && passwordConfirmation != password { return "The passwords don't match." }
        return nil
    }

    var canSubmit: Bool {
        !session.trimmedEmail.isEmpty && !username.isEmpty && !password.isEmpty
            && password == passwordConfirmation && usernameProblem == nil && passwordProblem == nil && acceptsTermsOfUse && acceptsPrivacyPolicy && !isLoading
    }

    /// Creates the account, then shows the hint to verify the email
    func signUp() async {
        guard canSubmit else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            session.email = session.trimmedEmail
            let message = try await session.auth.signUp(email: session.email, password: password, username: username)
            session.didSignUp(message: message)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Forgot password

/// Sends the link to the password reset page. The message is the same whether or not an account exists.
@MainActor
@Observable
final class ForgotPasswordViewModel {

    let session: AuthViewModel

    var isLoading = false
    var errorMessage: String?
    var message: String?

    init(session: AuthViewModel) {
        self.session = session
    }

    var email: String {
        get { session.email }
        set { session.email = newValue }
    }

    var canSubmit: Bool {
        !session.trimmedEmail.isEmpty && !isLoading
    }

    func sendResetLink() async {
        guard canSubmit else { return }
        isLoading = true
        errorMessage = nil
        message = nil
        defer { isLoading = false }
        do {
            message = try await session.auth.forgotPassword(email: session.trimmedEmail)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Check email

/// The account can only be used once the email is verified with the link the server sent
@MainActor
@Observable
final class CheckEmailViewModel {

    @ObservationIgnored private let auth: any AuthServicing
    let email: String
    let message: String

    var isLoading = false
    var resendMessage: String?

    init(auth: any AuthServicing, email: String, message: String) {
        self.auth = auth
        self.email = email
        self.message = message
    }

    func resend() async {
        isLoading = true
        defer { isLoading = false }
        do {
            resendMessage = try await auth.resendVerificationEmail(to: email)
        } catch {
            resendMessage = error.localizedDescription
        }
    }
}
