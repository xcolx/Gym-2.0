//
//  AuthView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import SwiftUI

/// Shown while signed out: the welcome screen, from which the login, creating an account, the hint to verify the email
/// afterwards and the password reset are opened.
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

    // At most one screen on top of the welcome screen: switching between the login and creating an account replaces
    // it, so going back always leads to the welcome screen
    private var path: Binding<[AuthViewModel.Screen]> {
        Binding(
            get: { model.screen == .welcome ? [] : [model.screen] },
            set: { model.show($0.last ?? .welcome) }
        )
    }

    var body: some View {
        NavigationStack(path: path) {
            WelcomeView(showSignUp: { model.show(.signUp) }, showLogin: { model.show(.login) })
                .navigationDestination(for: AuthViewModel.Screen.self) { screen in
                    // Every screen starts with new input, like a new view
                    switch screen {
                    case .welcome:
                        EmptyView()
                    case .login:
                        LoginView(model: LoginViewModel(session: model), showSignUp: { model.show(.signUp) }, showForgotPassword: { model.show(.forgotPassword) })
                    case .signUp:
                        SignUpView(model: SignUpViewModel(session: model), showLogin: { model.show(.login) })
                    case .forgotPassword:
                        ForgotPasswordView(model: ForgotPasswordViewModel(session: model))
                    case .checkEmail(let email, let message):
                        CheckEmailView(model: CheckEmailViewModel(auth: model.auth, email: email, message: message), showLogin: { model.show(.login) })
                    }
                }
        }
        .tint(userSettings.appColor)
    }
}

// MARK: - Welcome

private struct WelcomeView: View {

    let showSignUp: () -> Void
    let showLogin: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            AppMark(size: 88)

            Text("Gym 2.0")
                .font(.largeTitle.bold())
                .padding(.top, 16)
            Text("Track every set. See every muscle.")
                .font(.title3)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 18) {
                FeatureRow(systemImage: "chart.xyaxis.line", title: "Stats on every exercise", subtitle: "See how your weights and sets develop.")
                FeatureRow(systemImage: "figure.arms.open", title: "See which muscles you hit", subtitle: "Spot the ones you haven't trained lately.")
                FeatureRow(systemImage: "bubble.left.and.bubble.right", title: "Train with your friends", subtitle: "Chat and share your workouts.")
            }
            .padding(.top, 40)
            .padding(.horizontal, 8)

            Spacer()
            Spacer()

            VStack(spacing: 12) {
                Button(action: showSignUp) {
                    AuthButtonLabel(title: "Create account", isLoading: false)
                }
                .buttonStyle(PrimaryButtonStyle())

                Button(action: showLogin) {
                    Text("Log in")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
        .frame(maxWidth: 500)
        .frame(maxWidth: .infinity)
        .background(Color(.systemGroupedBackground))
        .toolbar(.hidden, for: .navigationBar)
    }
}

private struct FeatureRow: View {
    let systemImage: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Login

struct LoginView: View {

    private enum Field { case email, password }

    @State private var model: LoginViewModel
    @FocusState private var focusedField: Field?
    let showSignUp: () -> Void
    let showForgotPassword: () -> Void

    init(model: LoginViewModel, showSignUp: @escaping () -> Void, showForgotPassword: @escaping () -> Void) {
        _model = State(initialValue: model)
        self.showSignUp = showSignUp
        self.showForgotPassword = showForgotPassword
    }

    var body: some View {
        @Bindable var model = model
        AuthPage(title: "Welcome back", subtitle: "Log in to continue your training.") {
            AuthTextField(systemImage: "envelope", placeholder: "Email", text: $model.email, kind: .email)
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }
            AuthTextField(systemImage: "lock", placeholder: "Password", text: $model.password, kind: .password)
                .focused($focusedField, equals: .password)
                .submitLabel(.go)
                .onSubmit(login)

            HStack {
                Spacer()
                Button("Forgot password?", action: showForgotPassword)
                    .font(.subheadline.weight(.medium))
            }

            if let errorMessage = model.errorMessage {
                AuthMessage(text: errorMessage, style: .error)
            }
        } bottom: {
            Button(action: login) {
                AuthButtonLabel(title: "Log in", isLoading: model.isLoading)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!model.canSubmit)

            AuthSwitchLink(question: "New here?", action: "Create an account", perform: showSignUp)
        }
    }

    private func login() {
        Task { await model.login() }
    }
}

// MARK: - Sign up

struct SignUpView: View {

    private enum Field { case email, username, password, passwordConfirmation }

    /// Shows the hint to verify the email once the account is created, see `SignUpViewModel.signUp()`
    @State private var model: SignUpViewModel
    @FocusState private var focusedField: Field?
    let showLogin: () -> Void

    init(model: SignUpViewModel, showLogin: @escaping () -> Void) {
        _model = State(initialValue: model)
        self.showLogin = showLogin
    }

    var body: some View {
        @Bindable var model = model
        AuthPage(title: "Create account", subtitle: "Your workouts are saved to your account, so they're safe on every device.") {
            AuthTextField(systemImage: "envelope", placeholder: "Email", text: $model.email, kind: .email)
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .username }

            AuthTextField(systemImage: "person", placeholder: "Username", text: $model.username, kind: .username)
                .focused($focusedField, equals: .username)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }
            if let usernameProblem = model.usernameProblem {
                AuthMessage(text: usernameProblem, style: .error)
            }

            AuthTextField(systemImage: "lock", placeholder: "Password", text: $model.password, kind: .newPassword)
                .focused($focusedField, equals: .password)
                .submitLabel(.next)
                .onSubmit { focusedField = .passwordConfirmation }
            AuthTextField(systemImage: "lock.rotation", placeholder: "Repeat password", text: $model.passwordConfirmation, kind: .newPassword)
                .focused($focusedField, equals: .passwordConfirmation)
                .submitLabel(.done)
                .onSubmit(signUp)

            VStack(alignment: .leading, spacing: 6) {
                PasswordRule(title: "8 to 50 characters", isMet: model.passwordHasValidLength)
                PasswordRule(title: "Two of: lowercase, uppercase, digits, symbols", isMet: model.passwordHasEnoughKinds)
                PasswordRule(title: "Passwords match", isMet: model.passwordsMatch)
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 8)

            AuthCheckbox(isOn: $model.acceptsTermsOfUse) {
                // Literals, since Markdown links are only parsed in string literals
                Text("I'm at least 16 years old and accept the [Terms of Use](https://gym2.app/tos)")
            }
            AuthCheckbox(isOn: $model.acceptsPrivacyPolicy) {
                Text("I accept the [Privacy Policy](https://gym2.app/privacy)")
            }

            if let errorMessage = model.errorMessage {
                AuthMessage(text: errorMessage, style: .error)
            }
        } bottom: {
            Button(action: signUp) {
                AuthButtonLabel(title: "Create account", isLoading: model.isLoading)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!model.canSubmit)

            AuthSwitchLink(question: "Already have an account?", action: "Log in", perform: showLogin)
        }
    }

    private func signUp() {
        Task { await model.signUp() }
    }
}

private struct PasswordRule: View {
    let title: String
    let isMet: Bool

    var body: some View {
        Label(title, systemImage: isMet ? "checkmark.circle.fill" : "circle")
            .font(.footnote)
            .foregroundStyle(isMet ? Color.green : Color.secondary)
            .animation(.default, value: isMet)
            .accessibilityValue(isMet ? "Met" : "Not met")
    }
}

// MARK: - Forgot password

/// Sends the link to the password reset page. The message is the same whether or not an account exists.
struct ForgotPasswordView: View {

    @State private var model: ForgotPasswordViewModel

    init(model: ForgotPasswordViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        AuthPage(systemImage: "key", title: "Reset password", subtitle: "Enter your email and we'll send you a link to set a new password.") {
            AuthTextField(systemImage: "envelope", placeholder: "Email", text: $model.email, kind: .email)
                .submitLabel(.send)
                .onSubmit(sendResetLink)

            if let errorMessage = model.errorMessage {
                AuthMessage(text: errorMessage, style: .error)
            } else if let message = model.message {
                AuthMessage(text: message, style: .success)
            }
        } bottom: {
            Button(action: sendResetLink) {
                AuthButtonLabel(title: "Send link", isLoading: model.isLoading)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!model.canSubmit)
        }
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
        VStack(spacing: 0) {
            Spacer()

            Image(systemName: "envelope.badge")
                .font(.system(size: 40, weight: .medium))
                .foregroundStyle(.tint)
                .frame(width: 96, height: 96)
                .background(.tint.opacity(0.12), in: Circle())

            Text("Check your email")
                .font(.title.bold())
                .padding(.top, 20)

            Text("We sent a link to **\(model.email)**. Open it to verify your email address, then come back and log in.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 8)

            if !model.message.isEmpty {
                Text(model.message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
            }

            Spacer()
            Spacer()

            Button(action: showLogin) {
                AuthButtonLabel(title: "Go to log in", isLoading: false)
            }
            .buttonStyle(PrimaryButtonStyle())

            Button {
                Task { await model.resend() }
            } label: {
                if model.isLoading {
                    ProgressView()
                } else {
                    Text("Didn't get it? Send it again")
                }
            }
            .font(.subheadline.weight(.medium))
            .disabled(model.isLoading)
            .padding(.top, 16)

            if let resendMessage = model.resendMessage {
                Text(resendMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 6)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
        .frame(maxWidth: 500)
        .frame(maxWidth: .infinity)
        .background(Color(.systemGroupedBackground))
        .toolbarTitleDisplayMode(.inline)
    }
}

// MARK: - Shared

/// The app icon on the welcome screen, in the shape of the home screen icons
private struct AppMark: View {
    let size: CGFloat

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
        Image("Icon_image")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(shape)
            // the black icon would disappear on the dark background without its edge
            .overlay(shape.strokeBorder(.white.opacity(colorScheme == .dark ? 0.2 : 0), lineWidth: 1))
            .shadow(color: .black.opacity(0.25), radius: size * 0.15, y: size * 0.08)
            .accessibilityHidden(true)
    }
}

/// A screen of the login flow: a large heading, the content and a bottom part with the main button, which stays above
/// the keyboard
private struct AuthPage<Content: View, Bottom: View>: View {

    var systemImage: String? = nil
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content
    @ViewBuilder let bottom: Bottom

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 26, weight: .medium))
                        .foregroundStyle(.tint)
                        .frame(width: 60, height: 60)
                        .background(.tint.opacity(0.12), in: Circle())
                        .padding(.bottom, 4)
                }
                Text(title)
                    .font(.largeTitle.bold())
                Text(subtitle)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 16)

                content
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .frame(maxWidth: 500)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 14) {
                bottom
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .frame(maxWidth: 500)
            .frame(maxWidth: .infinity)
            .background(Color(.systemGroupedBackground))
        }
        .background(Color(.systemGroupedBackground))
        .toolbarTitleDisplayMode(.inline)
    }
}

/// A rounded text field with an icon. Password fields have a button to show the password.
private struct AuthTextField: View {

    enum Kind { case email, username, password, newPassword }

    let systemImage: String
    let placeholder: String
    @Binding var text: String
    let kind: Kind

    @State private var showsPassword = false

    private var isSecure: Bool {
        (kind == .password || kind == .newPassword) && !showsPassword
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .foregroundStyle(.secondary)
                .frame(width: 22)
                .accessibilityHidden(true)

            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .textContentType(contentType)
            .keyboardType(kind == .email ? .emailAddress : .default)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

            if kind == .password || kind == .newPassword {
                Button {
                    showsPassword.toggle()
                } label: {
                    Image(systemName: showsPassword ? "eye.slash" : "eye")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(showsPassword ? "Hide password" : "Show password")
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color(.separator).opacity(0.5), lineWidth: 0.5)
        )
    }

    private var contentType: UITextContentType {
        switch kind {
        case .email: .emailAddress
        case .username: .username
        case .password: .password
        case .newPassword: .newPassword
        }
    }
}

/// A checkbox with a label, whose links can be tapped on their own
private struct AuthCheckbox<Label: View>: View {

    @Binding var isOn: Bool
    @ViewBuilder let label: Label

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Button {
                isOn.toggle()
            } label: {
                Image(systemName: isOn ? "checkmark.square.fill" : "square")
                    .font(.title3)
                    .foregroundStyle(isOn ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? .isSelected : [])

            label
                .font(.subheadline)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAction { isOn.toggle() }
    }
}

/// An error or success below the fields
private struct AuthMessage: View {

    enum Style { case error, success }

    let text: String
    let style: Style

    var body: some View {
        Label(text, systemImage: style == .error ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
            .font(.subheadline)
            .foregroundStyle(style == .error ? Color.red : Color.green)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((style == .error ? Color.red : Color.green).opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// The link between logging in and creating an account
private struct AuthSwitchLink: View {
    let question: String
    let action: String
    let perform: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(question)
                .foregroundStyle(.secondary)
            Button(action, action: perform)
                .fontWeight(.semibold)
        }
        .font(.subheadline)
    }
}

private struct AuthButtonLabel: View {
    let title: String
    let isLoading: Bool

    var body: some View {
        if isLoading {
            ProgressView()
        } else {
            Text(title)
        }
    }
}
