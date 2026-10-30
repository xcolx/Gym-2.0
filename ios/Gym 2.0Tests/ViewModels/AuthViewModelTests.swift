//
//  AuthViewModelTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 22.10.2026.
//
//  The login, sign up, password reset and verification hint while signed out
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
@Suite struct AuthViewModelTests {

    let auth = FakeAuthService()
    let session: AuthViewModel

    init() {
        session = AuthViewModel(auth: auth)
    }

    // MARK: - Login

    @Test func logsInWithTheTrimmedEmail() async {
        let login = LoginViewModel(session: session)
        login.email = "  tester@example.com "
        login.password = "secret"
        #expect(login.canSubmit)

        await login.login()

        #expect(auth.logins.count == 1)
        #expect(auth.logins.first?.email == "tester@example.com")
        #expect(auth.logins.first?.password == "secret")
        #expect(!login.isLoading)
        #expect(login.errorMessage == nil)
    }

    @Test func needsAnEmailAndAPasswordToLogIn() async {
        let login = LoginViewModel(session: session)
        login.email = "   "
        login.password = "secret"
        #expect(!login.canSubmit)

        await login.login()

        #expect(auth.logins.isEmpty)
    }

    @Test func offersToResendTheVerificationEmail() async {
        auth.failure = serverError(403, code: "EmailVerificationError", "Verify your email first.")
        let login = LoginViewModel(session: session)
        login.email = "tester@example.com "
        login.password = "secret"

        await login.login()

        #expect(login.errorMessage == "Verify your email first.")
        #expect(login.emailNotVerified)

        auth.failure = nil
        await login.resendVerificationEmail()

        #expect(auth.resentTo == ["tester@example.com"])
        #expect(login.resendMessage == "Email sent.")
    }

    @Test func showsOtherLoginErrorsWithoutTheResendButton() async {
        auth.failure = serverError(401, "Wrong email or password.")
        let login = LoginViewModel(session: session)
        login.email = "tester@example.com"
        login.password = "wrong"

        await login.login()

        #expect(login.errorMessage == "Wrong email or password.")
        #expect(!login.emailNotVerified)
        #expect(!login.isLoading)
    }

    @Test func theScreensShareTheEmail() {
        let login = LoginViewModel(session: session)
        login.email = "tester@example.com"
        session.show(.forgotPassword)

        #expect(ForgotPasswordViewModel(session: session).email == "tester@example.com")
    }

    // MARK: - Sign up

    func filledSignUp() -> SignUpViewModel {
        let signUp = SignUpViewModel(session: session)
        signUp.email = " new@example.com "
        signUp.username = "new_user"
        signUp.password = "Password1"
        signUp.passwordConfirmation = "Password1"
        signUp.acceptsTermsOfUse = true
        signUp.acceptsPrivacyPolicy = true
        return signUp
    }

    @Test func checksTheUsernameLikeTheServer() {
        let signUp = SignUpViewModel(session: session)
        #expect(signUp.usernameProblem == nil)
        signUp.username = "ab"
        #expect(signUp.usernameProblem == "Between 3 and 20 characters.")
        signUp.username = "with space"
        #expect(signUp.usernameProblem == "Username may only contain letters, numbers, \"_\", \".\" and \"-\".")
        signUp.username = "fine.name-1_"
        #expect(signUp.usernameProblem == nil)
    }

    @Test func checksThePasswordAndItsRepetition() {
        let signUp = SignUpViewModel(session: session)
        signUp.password = "short"
        #expect(signUp.passwordProblem == "At least 8 characters.")
        signUp.password = "Password1"
        signUp.passwordConfirmation = "Password2"
        #expect(signUp.passwordProblem == "The passwords don't match.")
        signUp.passwordConfirmation = "Password1"
        #expect(signUp.passwordProblem == nil)
    }

    @Test func needsBothConsentsToSignUp() {
        let signUp = filledSignUp()
        #expect(signUp.canSubmit)
        signUp.acceptsPrivacyPolicy = false
        #expect(!signUp.canSubmit)
        signUp.acceptsPrivacyPolicy = true
        signUp.acceptsTermsOfUse = false
        #expect(!signUp.canSubmit)
    }

    @Test func showsTheVerificationHintAfterSigningUp() async {
        let signUp = filledSignUp()

        await signUp.signUp()

        #expect(auth.signUps.first?.email == "new@example.com")
        #expect(auth.signUps.first?.username == "new_user")
        #expect(session.email == "new@example.com")
        #expect(session.screen == .checkEmail(email: "new@example.com", message: "Account created."))
    }

    @Test func staysOnTheSignUpWhenItFails() async {
        auth.failure = serverError(409, "The username is taken.")
        session.show(.signUp)
        let signUp = filledSignUp()

        await signUp.signUp()

        #expect(signUp.errorMessage == "The username is taken.")
        #expect(session.screen == .signUp)
        #expect(!signUp.isLoading)
    }

    // MARK: - Password reset and verification

    @Test func sendsTheResetLink() async {
        let forgot = ForgotPasswordViewModel(session: session)
        forgot.email = " tester@example.com"

        await forgot.sendResetLink()

        #expect(auth.resetEmails == ["tester@example.com"])
        #expect(forgot.message == "Check your emails.")
        #expect(forgot.errorMessage == nil)
    }

    @Test func showsWhyTheResetLinkWasNotSent() async {
        auth.failure = APIError.transport(URLError(.notConnectedToInternet))
        let forgot = ForgotPasswordViewModel(session: session)
        forgot.email = "tester@example.com"

        await forgot.sendResetLink()

        #expect(forgot.message == nil)
        #expect(forgot.errorMessage == "Could not reach the server. Please check your internet connection.")
    }

    @Test func resendsTheVerificationEmailToTheNewAccount() async {
        let check = CheckEmailViewModel(auth: auth, email: "new@example.com", message: "Account created.")

        await check.resend()

        #expect(auth.resentTo == ["new@example.com"])
        #expect(check.resendMessage == "Email sent.")
        #expect(!check.isLoading)
    }
}
