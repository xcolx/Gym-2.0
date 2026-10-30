//
//  FriendActions.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import Foundation

/// Friend requests, removing and blocking users and opening direct chats. All need a connection.
///
/// The stored users are updated right away, so the lists change without waiting for the sync, which then loads
/// the friends and blocked users from the server again.
@MainActor
struct FriendActions {

    let friendService: any FriendServicing
    let chatService: any ChatServicing
    let syncService: any SyncServicing
    let users: UserRepository
    let chats: ChatRepository

    /// Nil while a service is missing from the environment, the actions are unavailable then
    static func make(friendService: (any FriendServicing)?, chatService: (any ChatServicing)?, syncService: any SyncServicing, users: UserRepository, chats: ChatRepository) -> FriendActions? {
        guard let friendService, let chatService else { return nil }
        return FriendActions(friendService: friendService, chatService: chatService, syncService: syncService, users: users, chats: chats)
    }

    /// Returns the server's message, e.g. that the request was sent or that the user's own request was accepted
    func sendRequest(to userId: Int) async throws -> String {
        let result = try await friendService.sendFriendRequest(to: userId)
        didChange()
        return result.message ?? "Friend request sent."
    }

    /// Cancels the request the current user sent to the user
    func cancelRequest(to userId: Int) async throws {
        do {
            try await friendService.deleteFriendRequest(with: userId)
        } catch let error as APIError where error.status == 404 {
            // Already answered, e.g. accepted in the meantime
        }
        didChange()
    }

    func answerRequest(from sender: UserDTO, accept: Bool) async throws {
        let result = try await friendService.answerFriendRequest(from: sender.id, accept: accept)
        if let newFriend = result.newFriend {
            users.user(for: newFriend).isFriend = true
        }
        didChange()
    }

    func removeFriend(id: Int) async throws {
        do {
            try await friendService.removeFriend(id: id)
        } catch let error as APIError where error.status == 404 {
            // Already removed, e.g. by the other user
        }
        users.user(serverId: id)?.isFriend = false
        didChange()
    }

    /// Blocking also removes the friendship. The direct chat is hidden until the user is unblocked.
    func block(id: Int, profile: UserDTO? = nil) async throws {
        _ = try await friendService.block(userId: id)
        let user = profile.map(users.user(for:)) ?? users.user(serverId: id)
        user?.isBlocked = true
        user?.isFriend = false
        didChange()
    }

    /// The direct chat with the friend, created if there is none yet
    func directChat(with friendId: Int) async throws -> Chat {
        let dto = try await chatService.createDirectChat(with: friendId)
        await syncService.store(dto)
        guard let chat = try chats.existingChat(serverId: dto.id) else {
            throw APIError.invalidResponse
        }
        return chat
    }

    private func didChange() {
        users.saveLoggingErrors("the changed friendship")
        Task { await syncService.sync() }
    }
}
