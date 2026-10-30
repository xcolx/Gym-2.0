//
//  FriendService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import SwiftUI

extension EnvironmentValues {
    @Entry var friendService: FriendService? = nil
}

/// Friends, friend requests and blocked users of the current user against /users.
final class FriendService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func friends() async throws -> [UserDTO] {
        try await api.send(.friends)
    }

    /// Removes the friendship for both users.
    func removeFriend(id: Int) async throws {
        try await api.send(.removeFriend(id: id))
    }

    // MARK: - Friend requests

    /// The pending requests the current user received.
    func friendRequests() async throws -> [FriendRequestDTO] {
        try await api.send(.friendRequests)
    }

    /// The pending requests the current user sent, they can be cancelled with `deleteFriendRequest(with:)`.
    func sentFriendRequests() async throws -> [SentFriendRequestDTO] {
        try await api.send(.sentFriendRequests)
    }

    /// If the other user already sent the current user a request, it is accepted instead.
    func sendFriendRequest(to userId: Int) async throws -> UpdateResultDTO {
        try await api.send(.sendFriendRequest(to: userId))
    }

    func answerFriendRequest(from senderId: Int, accept: Bool) async throws -> FriendRequestAnswerDTO {
        try await api.send(.answerFriendRequest(from: senderId, FriendRequestAnswer(status: accept)))
    }

    /// Cancels the request the current user sent to the user, or declines the one the user sent.
    func deleteFriendRequest(with userId: Int) async throws {
        try await api.send(.deleteFriendRequest(with: userId))
    }

    // MARK: - Blocked users

    func blockedUsers() async throws -> [UserDTO] {
        try await api.send(.blockedUsers)
    }

    /// Blocking also removes the friendship. Reporting the user is a separate request (ReportService).
    func block(userId: Int) async throws -> UpdateResultDTO {
        try await api.send(.block(userId: userId))
    }

    func unblock(userId: Int) async throws {
        try await api.send(.unblock(userId: userId))
    }
}

private extension Endpoint {
    static let friends = Endpoint(method: .get, path: "/users/me/friends")
    static let friendRequests = Endpoint(method: .get, path: "/users/me/friend-requests")
    static let sentFriendRequests = Endpoint(method: .get, path: "/users/me/friend-requests/sent")
    static let blockedUsers = Endpoint(method: .get, path: "/users/me/blocked-users")

    static func removeFriend(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/users/me/friends/\(id)")
    }

    static func sendFriendRequest(to userId: Int) -> Endpoint {
        Endpoint(method: .post, path: "/users/me/friend-requests/\(userId)")
    }

    static func answerFriendRequest(from senderId: Int, _ answer: FriendRequestAnswer) -> Endpoint {
        Endpoint(method: .patch, path: "/users/me/friend-requests/\(senderId)", body: .json(answer))
    }

    static func deleteFriendRequest(with userId: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/users/me/friend-requests/\(userId)")
    }

    static func block(userId: Int) -> Endpoint {
        Endpoint(method: .put, path: "/users/me/blocked-users/\(userId)")
    }

    static func unblock(userId: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/users/me/blocked-users/\(userId)")
    }
}
