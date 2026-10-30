//
//  AccountSettingsViewModelTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 22.10.2026.
//
//  The account settings: logout, deleting the account, the username, email, password and the data takeout
//

import Foundation
import Testing
import UIKit
@testable import Gym_2_0

@MainActor
@Suite struct AccountSettingsViewModelTests {

    let store: TestStore
    let auth = FakeAuthService()
    let sync = FakeSyncService()
    let userService = FakeUserService()
    let user: User

    init() throws {
        store = try TestStore()
        user = User(serverId: 1, username: "tester", profileImageUrl: "", profileIconUrl: "")
        user.email = "tester@example.com"
        store.context.insert(user)
        try store.context.save()
    }

    var services: AccountServices {
        AccountServices(auth: auth, sync: sync, userService: userService, users: UserRepository(context: store.context))
    }

    // MARK: - Logout

    @Test func uploadsTheChangesBeforeTheLogoutAndThenDeletesTheLocalData() async {
        sync.hasUnpushedChanges = true
        let model = AccountSectionViewModel(services: services)

        await model.logout(force: false)

        #expect(sync.pushCount == 1)
        #expect(auth.logoutCount == 1)
        #expect(sync.deleteLocalDataCount == 1)
        #expect(!model.showsUnpushedChanges)
        #expect(!model.isLoggingOut)
    }

    @Test func asksBeforeLoggingOutWithChangesThatCouldNotBeUploaded() async {
        sync.hasUnpushedChanges = true
        sync.pushSucceeds = false
        let model = AccountSectionViewModel(services: services)

        await model.logout(force: false)

        #expect(model.showsUnpushedChanges)
        #expect(auth.logoutCount == 0)
        #expect(sync.deleteLocalDataCount == 0)
    }

    @Test func logsOutAnywayButKeepsTheChangesForTheNextLogin() async {
        sync.hasUnpushedChanges = true
        let model = AccountSectionViewModel(services: services)

        await model.logout(force: true)

        #expect(sync.pushCount == 0)
        #expect(auth.logoutCount == 1)
        #expect(sync.deleteLocalDataCount == 0)
    }

    // MARK: - Deleting the account

    @Test func deletesTheAccountWithThePassword() async {
        let model = AccountSectionViewModel(services: services)
        model.confirmDeletion()
        #expect(model.showsFinalDeleteConfirmation)
        #expect(!model.canDelete)
        model.deletePassword = "Password1"
        #expect(model.canDelete)

        await model.deleteAccount()

        #expect(userService.deletedWithPasswords == ["Password1"])
        #expect(model.deletePassword.isEmpty)
        #expect(auth.logoutCount == 1)
        #expect(sync.deleteLocalDataCount == 1)
        #expect(model.errorMessage == nil)
        #expect(!model.isDeleting)
    }

    @Test func keepsTheAccountWhenTheServerRefusesTheDeletion() async {
        userService.failure = serverError(403, "Wrong password.")
        let model = AccountSectionViewModel(services: services)
        model.deletePassword = "Password1"

        await model.deleteAccount()

        #expect(model.errorMessage == "Wrong password.")
        #expect(auth.logoutCount == 0)
        #expect(sync.deleteLocalDataCount == 0)
    }

    // MARK: - Profile image

    @Test func storesTheUploadedProfileImage() async {
        let model = ProfileImageViewModel(user: user, services: services)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }

        await model.upload(image)

        #expect(user.profileImageUrl == "image-hash")
        #expect(user.profileIconUrl == "icon-hash")
        #expect(!store.context.hasChanges)
        #expect(auth.refreshCount == 1)
        #expect(!model.isUploading)
    }

    @Test func removesTheProfileImage() async {
        user.profileImageUrl = "image-hash"
        user.profileIconUrl = "icon-hash"
        let model = ProfileImageViewModel(user: user, services: services)

        await model.remove()

        #expect(userService.deletedProfileImage)
        #expect(user.profileImageUrl.isEmpty)
        #expect(user.profileIconUrl.isEmpty)
        #expect(!store.context.hasChanges)
    }

    // MARK: - Username

    @Test func checksTheNewUsername() {
        let model = ChangeUsernameViewModel(user: user, services: services)
        model.onAppear()
        #expect(model.username == "tester")
        #expect(!model.canSave)
        model.username = "x"
        #expect(model.usernameProblem == "Between 3 and 20 characters.")
        #expect(!model.canSave)
        model.username = "renamed"
        #expect(model.canSave)
    }

    @Test func savesTheNewUsername() async {
        let model = ChangeUsernameViewModel(user: user, services: services)
        model.username = "renamed"

        let saved = await model.save()

        #expect(saved)
        #expect(userService.usernames == ["renamed"])
        #expect(user.username == "renamed")
        #expect(!store.context.hasChanges)
        #expect(auth.refreshCount == 1)
    }

    @Test func keepsTheUsernameWhenTheServerRefusesIt() async {
        userService.failure = serverError(409, "The username is taken.")
        let model = ChangeUsernameViewModel(user: user, services: services)
        model.username = "taken"

        let saved = await model.save()

        #expect(!saved)
        #expect(model.errorMessage == "The username is taken.")
        #expect(user.username == "tester")
    }

    // MARK: - Email and password

    @Test func sendsTheConfirmationLinkToTheNewEmail() async {
        let model = ChangeEmailViewModel(user: user, services: services)
        model.email = " TESTER@example.com "
        model.password = "Password1"
        // the same email in other case
        #expect(!model.canSave)
        model.email = " new@example.com "
        #expect(model.canSave)

        await model.save()

        #expect(userService.emailChanges.first?.email == "new@example.com")
        #expect(model.sentTo == "new@example.com")
        // only changed once the link is opened
        #expect(user.email == "tester@example.com")
    }

    @Test func checksTheNewPassword() async {
        let model = ChangePasswordViewModel(services: services)
        model.currentPassword = "OldPassword1"
        model.newPassword = "password"
        #expect(model.passwordProblem == "Use at least two of: lowercase letters, uppercase letters, digits, special characters.")
        model.newPassword = "NewPassword1"
        model.passwordConfirmation = "NewPassword2"
        #expect(model.passwordProblem == "The passwords don't match.")
        #expect(!model.canSave)
        model.passwordConfirmation = "NewPassword1"
        #expect(model.canSave)

        await model.save()

        #expect(userService.passwordChanges.first?.new == "NewPassword1")
        #expect(model.showsSuccess)
    }

    // MARK: - Data takeout

    @Test func writesTheTakeoutAndRemovesItAgain() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let model = DataTakeoutViewModel(services: services, directory: directory)

        await model.load()

        let url = try #require(model.fileURL)
        #expect(url.lastPathComponent.hasPrefix("Gym 2.0 Data Takeout "))
        #expect(try Data(contentsOf: url) == Data("zip".utf8))

        model.removeFile()

        #expect(model.fileURL == nil)
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }

    @Test func showsWhyTheTakeoutFailed() async {
        userService.failure = serverError(429, "Too many requests.")
        let model = DataTakeoutViewModel(services: services)

        await model.load()

        #expect(model.fileURL == nil)
        #expect(model.errorMessage == "Too many requests.")
        #expect(!model.isLoading)
    }
}
