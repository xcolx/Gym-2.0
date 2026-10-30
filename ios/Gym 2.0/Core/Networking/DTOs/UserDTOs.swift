//
//  UserDTOs.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

// Mirrors backend/app/schemas/users.py

// MARK: - Responses

/// A user profile. The optional fields are only included for the current user (the language also for friends,
/// the scheme color for everyone).
struct UserDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let username: String
    let email: String?
    /// Image hash, served by GET /images/{hash}. Empty if the user has none.
    let profileImageUrl: String
    let profileIconUrl: String
    /// In kilograms.
    let bodyweight: Double?
    /// The app color as a hex code, e.g. "#FF0000". Nil if the user never chose one.
    let schemeColor: String?
    let weightUnit: UnitSystem?
    let distanceUnit: UnitSystem?
    /// ISO 639-1 code, e.g. "en".
    let language: String?
    let createdAt: Date?
}

enum UnitSystem: Int, Codable {
    case metric = 0
    case imperial = 1
}

/// The result of an update. `success` is false if nothing had to be changed (e.g. the same username again).
struct UpdateResultDTO: Decodable, Equatable {
    let success: Bool
    let message: String?
}

struct ProfileImageDTO: Decodable, Equatable {
    let success: Bool
    /// Image hashes, served by GET /images/{hash}.
    let imageUrl: String?
    let iconUrl: String?
    let message: String?
}

struct FriendRequestDTO: Decodable, Equatable {
    let sender: UserDTO
    let timestamp: Date
}

struct SentFriendRequestDTO: Decodable, Equatable {
    let receiver: UserDTO
    let timestamp: Date
}

struct FriendRequestAnswerDTO: Decodable, Equatable {
    let success: Bool
    let message: String?
    /// The new friend, if the request was accepted.
    let newFriend: UserDTO?
}

// MARK: - Requests

/// Only the fields that are set are changed.
struct ProfileUpdate: Encodable, Equatable {
    /// In kilograms, above 0 and below 1000.
    var bodyweight: Double?
    /// Hex code, e.g. "#FF0000".
    var schemeColor: String?
    var weightUnit: UnitSystem?
    var distanceUnit: UnitSystem?
}

struct UsernameUpdate: Encodable {
    let username: String
}

struct PasswordUpdate: Encodable {
    let currentPassword: String
    let newPassword: String
}

struct EmailUpdate: Encodable {
    let email: String
    let password: String
}

struct AccountDeletion: Encodable {
    /// The current password, which confirms the deletion.
    let password: String
}

struct FriendRequestAnswer: Encodable {
    /// True to accept, false to decline.
    let status: Bool
}
