//
//  UserService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import SwiftUI

extension EnvironmentValues {
    @Entry var userService: UserService? = nil
}

/// User profiles and the current user's account against /users.
///
/// After changing the current user's profile, call `AuthService.refreshCurrentUser()` to update `currentUser`.
final class UserService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// The current user's full profile. Fails with `APIError.unauthorized` if the session is no longer valid.
    func me() async throws -> UserDTO {
        try await api.send(.me)
    }

    /// Full info for the current user, friend-level info for friends, public info otherwise.
    /// Fails with 403 if the user blocked the current user.
    func user(id: Int) async throws -> UserDTO {
        try await api.send(.user(id: id))
    }

    /// Finds a user by their exact, case-sensitive username. Fails with 404 if there is none.
    func user(username: String) async throws -> UserDTO {
        try await api.send(.lookup(username: username))
    }

    // MARK: - Current user

    func updateProfile(_ update: ProfileUpdate) async throws -> UpdateResultDTO {
        try await api.send(.updateProfile(update))
    }

    /// Uploads a new profile image. The backend also generates a square icon from it.
    func updateProfileImage(_ image: ImageUpload) async throws -> ProfileImageDTO {
        try await api.send(.updateProfileImage(image))
    }

    func deleteProfileImage() async throws {
        try await api.send(.deleteProfileImage)
    }

    /// Fails with 400 if the username is taken. Limited to once a minute.
    func changeUsername(to username: String) async throws -> UpdateResultDTO {
        try await api.send(.updateUsername(UsernameUpdate(username: username)))
    }

    /// Ends all other sessions, the current one stays valid. Fails with 403 if the current password is wrong.
    func changePassword(from currentPassword: String, to newPassword: String) async throws -> UpdateResultDTO {
        try await api.send(.updatePassword(PasswordUpdate(currentPassword: currentPassword, newPassword: newPassword)))
    }

    /// Sends a confirmation link to the new address, which only replaces the current email once it is confirmed. The
    /// session stays valid. Sending the current email cancels a pending change. Fails with 403 if the password is wrong.
    func changeEmail(to email: String, password: String) async throws -> UpdateResultDTO {
        try await api.send(.updateEmail(EmailUpdate(email: email, password: password)))
    }

    /// Deletes the account and ends the session, the password confirms it.
    func deleteAccount(password: String) async throws {
        try await api.send(.deleteAccount(AccountDeletion(password: password)))
    }

    /// All data the server stores about the current user as a ZIP file with data.json and the images (GDPR). Limited to 5 requests an hour.
    func dataTakeout() async throws -> Data {
        try await api.data(.dataTakeout)
    }
}

private extension Endpoint {
    static let me = Endpoint(method: .get, path: "/users/me")
    /// A large account takes a while, so the timeout is longer than the default
    static let dataTakeout = Endpoint(method: .get, path: "/users/me/takeout", timeout: 120)

    static func user(id: Int) -> Endpoint {
        Endpoint(method: .get, path: "/users/\(id)")
    }

    static func lookup(username: String) -> Endpoint {
        Endpoint(method: .get, path: "/users", queryItems: [URLQueryItem(name: "username", value: username)])
    }

    static func updateProfile(_ update: ProfileUpdate) -> Endpoint {
        Endpoint(method: .patch, path: "/users/me", body: .json(update))
    }

    static func updateProfileImage(_ image: ImageUpload) -> Endpoint {
        var form = MultipartFormData()
        form.appendFile(image.data, name: "file", filename: image.filename, mimeType: image.mimeType)
        return Endpoint(method: .put, path: "/users/me/profile-image", body: .multipart(form))
    }

    static let deleteProfileImage = Endpoint(method: .delete, path: "/users/me/profile-image")

    static func updateUsername(_ update: UsernameUpdate) -> Endpoint {
        Endpoint(method: .patch, path: "/users/me/username", body: .json(update))
    }

    static func updatePassword(_ update: PasswordUpdate) -> Endpoint {
        Endpoint(method: .patch, path: "/users/me/password", body: .json(update))
    }

    static func updateEmail(_ update: EmailUpdate) -> Endpoint {
        Endpoint(method: .patch, path: "/users/me/email", body: .json(update))
    }

    static func deleteAccount(_ deletion: AccountDeletion) -> Endpoint {
        Endpoint(method: .delete, path: "/users/me", body: .json(deletion))
    }
}
