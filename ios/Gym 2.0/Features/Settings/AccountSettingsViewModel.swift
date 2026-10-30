//
//  AccountSettingsViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation
import PhotosUI
import SwiftUI
import UIKit

/// What the screens of the account settings need, built from the environment by AccountSection
@MainActor
struct AccountServices {
    let auth: any AuthServicing
    let sync: any SyncServicing
    /// Nil until the app environment provides it, the actions then do nothing
    let userService: (any UserServicing)?
    let users: UserRepository
}

// MARK: - Account section

/// Logging out and deleting the account
@MainActor
@Observable
final class AccountSectionViewModel {

    @ObservationIgnored private let services: AccountServices

    var showsLogoutConfirmation = false
    var isLoggingOut = false
    var showsUnpushedChanges = false
    var showsDeleteConfirmation = false
    var showsFinalDeleteConfirmation = false
    var deletePassword = ""
    var isDeleting = false
    var errorMessage: String?

    init(services: AccountServices) {
        self.services = services
    }

    /// The final confirmation asks for the password
    func confirmDeletion() {
        deletePassword = ""
        showsFinalDeleteConfirmation = true
    }

    var canDelete: Bool {
        deletePassword.count >= 8
    }

    /// Uploads the local changes first and deletes the local data after the logout. If some changes can't be uploaded,
    /// the user decides whether to log out anyway: the data is kept then, so they are uploaded with the next login.
    func logout(force: Bool) async {
        isLoggingOut = true
        defer { isLoggingOut = false }
        let isPushed = force ? !services.sync.hasUnpushedChanges : await services.sync.pushPendingChanges()
        guard isPushed || force else {
            showsUnpushedChanges = true
            return
        }
        await services.auth.logout()
        if isPushed {
            await services.sync.deleteLocalData()
        }
    }

    func deleteAccount() async {
        guard let userService = services.userService else { return }
        let password = deletePassword
        deletePassword = ""
        isDeleting = true
        errorMessage = nil
        defer { isDeleting = false }
        do {
            try await userService.deleteAccount(password: password)
            // The server already ended the session, this only clears it locally
            await services.auth.logout()
            // The account doesn't exist anymore, so neither do its unpushed changes
            await services.sync.deleteLocalData()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Profile image

/// Uploading and removing the profile image of the current user
@MainActor
@Observable
final class ProfileImageViewModel {

    let user: User
    @ObservationIgnored private let services: AccountServices

    var selectedPhoto: PhotosPickerItem?
    var imageToCrop: PickedImage?
    var isUploading = false
    var errorMessage: String?

    init(user: User, services: AccountServices) {
        self.user = user
        self.services = services
    }

    /// Opens the picked photo in the crop view
    func loadSelectedPhoto() async {
        guard let selectedPhoto else { return }
        errorMessage = nil
        if let data = try? await selectedPhoto.loadTransferable(type: Data.self), let image = UIImage(data: data) {
            imageToCrop = PickedImage(image: image)
        } else {
            errorMessage = "The image could not be loaded."
        }
        self.selectedPhoto = nil
    }

    func upload(_ image: UIImage) async {
        guard let userService = services.userService else { return }
        guard let jpeg = image.jpegData(compressionQuality: 0.85) else {
            errorMessage = "The image could not be loaded."
            return
        }
        isUploading = true
        errorMessage = nil
        defer { isUploading = false }
        do {
            let upload = ImageUpload(data: jpeg)
            let result = try await userService.updateProfileImage(upload)
            if let imageUrl = result.imageUrl, let iconUrl = result.iconUrl {
                user.profileImageUrl = imageUrl
                user.profileIconUrl = iconUrl
                services.users.saveLoggingErrors("the new profile image")
            }
            try? await services.auth.refreshCurrentUser()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func remove() async {
        guard let userService = services.userService else { return }
        isUploading = true
        errorMessage = nil
        defer { isUploading = false }
        do {
            try await userService.deleteProfileImage()
            user.profileImageUrl = ""
            user.profileIconUrl = ""
            services.users.saveLoggingErrors("the removed profile image")
            try? await services.auth.refreshCurrentUser()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// A picked image waiting to be cropped
struct PickedImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

// MARK: - Username

@MainActor
@Observable
final class ChangeUsernameViewModel {

    let user: User
    @ObservationIgnored private let services: AccountServices

    var username = ""
    var isSaving = false
    var errorMessage: String?

    init(user: User, services: AccountServices) {
        self.user = user
        self.services = services
    }

    func onAppear() {
        username = user.username
    }

    /// Same rules as the backend (and the sign up)
    var usernameProblem: String? {
        if username.isEmpty { return nil }
        if !(3...20).contains(username.count) { return "Between 3 and 20 characters." }
        if username.contains(where: { !($0.isASCII && ($0.isLetter || $0.isNumber || "_.-".contains($0))) }) {
            return "Username may only contain letters, numbers, \"_\", \".\" and \"-\"."
        }
        return nil
    }

    var canSave: Bool {
        !username.isEmpty && username != user.username && usernameProblem == nil && !isSaving
    }

    /// Returns whether the username was changed, the view is closed then
    func save() async -> Bool {
        guard let userService = services.userService else { return false }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            _ = try await userService.changeUsername(to: username)
            user.username = username
            services.users.saveLoggingErrors("the new username")
            try? await services.auth.refreshCurrentUser()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}

// MARK: - Email

@MainActor
@Observable
final class ChangeEmailViewModel {

    let user: User
    @ObservationIgnored private let services: AccountServices

    var email = ""
    var password = ""
    var isSaving = false
    var errorMessage: String?
    /// The new email the confirmation link was sent to
    var sentTo: String?

    init(user: User, services: AccountServices) {
        self.user = user
        self.services = services
    }

    var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespaces)
    }

    var canSave: Bool {
        trimmedEmail.contains("@") && trimmedEmail.lowercased() != user.email?.lowercased() && password.count >= 8 && !isSaving
    }

    /// The server sends a confirmation link to the new email, the current email and the session stay until it is opened
    func save() async {
        guard let userService = services.userService else { return }
        isSaving = true
        errorMessage = nil
        let newEmail = trimmedEmail
        defer { isSaving = false }
        do {
            _ = try await userService.changeEmail(to: newEmail, password: password)
            sentTo = newEmail
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Password

@MainActor
@Observable
final class ChangePasswordViewModel {

    @ObservationIgnored private let services: AccountServices

    var currentPassword = ""
    var newPassword = ""
    var passwordConfirmation = ""
    var isSaving = false
    var errorMessage: String?
    var showsSuccess = false

    init(services: AccountServices) {
        self.services = services
    }

    var passwordProblem: String? {
        if newPassword.isEmpty { return nil }
        if let problem = PasswordPolicy.problem(with: newPassword) { return problem }
        if !passwordConfirmation.isEmpty && passwordConfirmation != newPassword { return "The passwords don't match." }
        return nil
    }

    var canSave: Bool {
        currentPassword.count >= 8 && !newPassword.isEmpty && newPassword == passwordConfirmation && passwordProblem == nil && !isSaving
    }

    func save() async {
        guard let userService = services.userService else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            _ = try await userService.changePassword(from: currentPassword, to: newPassword)
            showsSuccess = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Data takeout

/// Downloads all data the server stores about the account as a ZIP file, which can then be shared or saved
@MainActor
@Observable
final class DataTakeoutViewModel {

    @ObservationIgnored private let services: AccountServices
    @ObservationIgnored private let directory: URL

    var fileURL: URL?
    var showsShareSheet = false
    var isLoading = false
    var errorMessage: String?

    /// The file is written to `directory`, the temporary directory by default
    init(services: AccountServices, directory: URL = FileManager.default.temporaryDirectory) {
        self.services = services
        self.directory = directory
    }

    /// The file holds personal data, so it's removed once it was saved or shared, or the sheet was closed
    func removeFile() {
        guard let fileURL else { return }
        try? FileManager.default.removeItem(at: fileURL)
        self.fileURL = nil
    }

    /// Written to the temporary directory, the share sheet copies it to where the user saves it
    func load() async {
        guard let userService = services.userService else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let data = try await userService.dataTakeout()
            let date = Date.now.formatted(.iso8601.year().month().day())
            let url = directory.appendingPathComponent("Gym 2.0 Data Takeout \(date).zip")
            try data.write(to: url, options: .atomic)
            fileURL = url
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
