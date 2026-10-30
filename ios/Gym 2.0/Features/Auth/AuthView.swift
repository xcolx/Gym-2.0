//
//  AuthView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import SwiftUI

/// Shown while signed out: login, creating an account, the hint to verify the email afterwards and the password reset.
struct AuthView: View {

    @Environment(AuthService.self) private var authService

    var body: some View {
        AuthContentView(model: AuthViewModel(auth: authService))
    }
}

private struct AuthContentView: View {

    @State private var model: AuthViewModel
    @Environment(UserSettings.self) private var userSettings

    // The view model is created once, later ones of the parent's body are discarded
    init(model: AuthViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        NavigationStack {
            Group {
                // Every screen starts with new input, like a new view
                switch model.screen {
                case .login:
                    LoginView(model: LoginViewModel(session: model), showSignUp: { model.show(.signUp) }, showForgotPassword: { model.show(.forgotPassword) })
                case .signUp:
                    SignUpView(model: SignUpViewModel(session: model), showLogin: { model.show(.login) })
                case .forgotPassword:
                    ForgotPasswordView(model: ForgotPasswordViewModel(session: model), showLogin: { model.show(.login) })
                case .checkEmail(let email, let message):
                    CheckEmailView(model: CheckEmailViewModel(auth: model.auth, email: email, message: message), showLogin: { model.show(.login) })
                }
            }
            .animation(.default, value: model.screen)
        }
        .tint(userSettings.appColor)
    }
}

// MARK: - Login

struct LoginView: View {

    @State private var model: LoginViewModel
    let showSignUp: () -> Void
    let showForgotPassword: () -> Void

    init(model: LoginViewModel, showSignUp: @escaping () -> Void, showForgotPassword: @escaping () -> Void) {
        _model = State(initialValue: model)
        self.showSignUp = showSignUp
        self.showForgotPassword = showForgotPassword
    }

    var body: some View {
        @Bindable var model = model
        Form {
            Section {
                AuthHeader(title: "Welcome back", subtitle: "Log in to your Gym 2.0 account.")
            }
            .listRowBackground(Color.clear)

            Section {
                TextField("Email", text: $model.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $model.password)
                    .textContentType(.password)
                    .onSubmit(login)
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                    if model.emailNotVerified {
                        Button("Resend verification email") {
                            Task { await model.resendVerificationEmail() }
                        }
                        .disabled(model.isLoading)
                    }
                    if let resendMessage = model.resendMessage {
                        Text(resendMessage)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section {
                Button(action: login) {
                    AuthButtonLabel(title: "Log In", isLoading: model.isLoading)
                }
                .disabled(!model.canSubmit)
            }

            Section {
                Button("Forgot password?", action: showForgotPassword)
                    .frame(maxWidth: .infinity)
                Button("Don't have an account? Create one", action: showSignUp)
                    .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
        }
        .navigationTitle("Log In")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func login() {
        Task { await model.login() }
    }
}

// MARK: - Sign up

struct SignUpView: View {

    /// Shows the hint to verify the email once the account is created, see `SignUpViewModel.signUp()`
    @State private var model: SignUpViewModel
    let showLogin: () -> Void

    init(model: SignUpViewModel, showLogin: @escaping () -> Void) {
        _model = State(initialValue: model)
        self.showLogin = showLogin
    }

    var body: some View {
        @Bindable var model = model
        Form {
            Section {
                AuthHeader(title: "Create an account", subtitle: "Your workouts are saved to your account, so they are safe on every device.")
            }
            .listRowBackground(Color.clear)

            Section {
                TextField("Email", text: $model.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            Section {
                TextField("Username", text: $model.username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } footer: {
                if let usernameProblem = model.usernameProblem {
                    Text(usernameProblem).foregroundStyle(.red)
                }
            }

            Section {
                SecureField("Password", text: $model.password)
                    .textContentType(.newPassword)
                SecureField("Repeat password", text: $model.passwordConfirmation)
                    .textContentType(.newPassword)
                    .onSubmit(signUp)
            } footer: {
                if let passwordProblem = model.passwordProblem {
                    Text(passwordProblem).foregroundStyle(.red)
                }
            }

            Section {
                Toggle(isOn: $model.acceptsTermsOfUse) {
                    // Literals, since Markdown links are only parsed in string literals
                    Text("I'm at least 16 years old and accept the [Terms of Use](https://gym2.app/tos)")
                }
                Toggle(isOn: $model.acceptsPrivacyPolicy) {
                    Text("I accept the [Privacy Policy](https://gym2.app/privacy)")
                }
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button(action: signUp) {
                    AuthButtonLabel(title: "Create Account", isLoading: model.isLoading)
                }
                .disabled(!model.canSubmit)
            }

            Section {
                Button("Already have an account? Log in", action: showLogin)
                    .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
        }
        .navigationTitle("Create Account")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func signUp() {
        Task { await model.signUp() }
    }
}

// MARK: - Forgot password

/// Sends the link to the password reset page. The message is the same whether or not an account exists.
struct ForgotPasswordView: View {

    @State private var model: ForgotPasswordViewModel
    let showLogin: () -> Void

    init(model: ForgotPasswordViewModel, showLogin: @escaping () -> Void) {
        _model = State(initialValue: model)
        self.showLogin = showLogin
    }

    var body: some View {
        @Bindable var model = model
        Form {
            Section {
                AuthHeader(title: "Forgot your password?", subtitle: "Enter your email and we'll send you a link to set a new password.")
            }
            .listRowBackground(Color.clear)

            Section {
                TextField("Email", text: $model.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit(sendResetLink)
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            } else if let message = model.message {
                Section {
                    Text(message)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Button(action: sendResetLink) {
                    AuthButtonLabel(title: "Send Reset Link", isLoading: model.isLoading)
                }
                .disabled(!model.canSubmit)
            }

            Section {
                Button("Back to Log In", action: showLogin)
                    .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
        }
        .navigationTitle("Forgot Password")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func sendResetLink() {
        Task { await model.sendResetLink() }
    }
}

// MARK: - Check email

/// The account can only be used once the email is verified with the link the server sent.
struct CheckEmailView: View {

    @State private var model: CheckEmailViewModel
    let showLogin: () -> Void

    init(model: CheckEmailViewModel, showLogin: @escaping () -> Void) {
        _model = State(initialValue: model)
        self.showLogin = showLogin
    }

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "envelope.badge")
                .font(.system(size: 64))
                .foregroundStyle(.tint)

            Text("Check your emails")
                .font(.title.bold())

            Text("We sent a link to **\(model.email)**. Open it to verify your email address, then come back and log in.")
                .multilineTextAlignment(.center)

            Text(model.message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Spacer()

            Button(action: showLogin) {
                Text("Go to Login")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            VStack(spacing: 6) {
                Button("Didn't get an email? Send it again") {
                    Task { await model.resend() }
                }
                .disabled(model.isLoading)
                if let resendMessage = model.resendMessage {
                    Text(resendMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .padding()
        .navigationTitle("Verify Email")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Shared

private struct AuthHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.system(size: 48))
                .foregroundStyle(.tint)
            Text(title)
                .font(.title2.bold())
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct AuthButtonLabel: View {
    let title: String
    let isLoading: Bool

    var body: some View {
        HStack {
            Spacer()
            if isLoading {
                ProgressView()
            } else {
                Text(title).bold()
            }
            Spacer()
        }
    }
}
