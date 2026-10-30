//
//  UserSync.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 12.10.2026.
//

import Foundation
import OSLog
import SwiftData

/// Syncs the users the app knows: the current user, friends, blocked users and the members of the user's chats.
/// Used by `SyncService`.
///
/// The backend has no delta for users, so every pull loads the current user, the friends and the blocked users again.
/// Other chat members are only loaded once, when they're first needed. Users that are none of these are removed.
/// The settings of the current user (bodyweight, scheme color, units) can be changed offline and are pushed.
@MainActor
final class UserSync {

    private let context: ModelContext
    private let userService: UserService
    private let friendService: FriendService

    /// Chat members whose profile the server doesn't return (deleted, or they blocked the current user)
    private var unavailableMemberIds: Set<Int> = []

    init(context: ModelContext, userService: UserService, friendService: FriendService) {
        self.context = context
        self.userService = userService
        self.friendService = friendService
    }

    // MARK: - Push

    /// Returns a message to show if the server rejected the settings. They are replaced by the server's with the next pull.
    func pushSettings() async throws -> String? {
        guard let user = try currentUser(), user.syncState != .synced else { return nil }
        let sent = user.profileUpdate
        do {
            _ = try await userService.updateProfile(sent)
            if user.profileUpdate == sent {
                user.syncState = .synced
            }
            return nil
        } catch {
            guard error.isRejection else { throw error }
            Logger.sync.error("The server rejected the settings: \(error.localizedDescription, privacy: .public)")
            user.syncState = .synced
            return "Your settings could not be saved: \(error.localizedDescription)"
        }
    }

    // MARK: - Pull

    func pull() async throws {
        unavailableMemberIds = []
        let me = try await userService.me()
        let friends = try await friendService.friends()
        let blocked = try await friendService.blockedUsers()

        var local = try usersByServerId()
        local.values.forEach { user in
            user.isCurrentUser = false
            user.isFriend = false
            user.isBlocked = false
        }

        // Settings changed offline are kept until they are pushed
        let current = upsert(me, into: &local, includingSettings: local[me.id]?.syncState != .updated)
        current.isCurrentUser = true
        for dto in friends {
            upsert(dto, into: &local).isFriend = true
        }
        for dto in blocked {
            upsert(dto, into: &local).isBlocked = true
        }

        let memberIds = try await loadMissingMembers(into: &local)

        for user in local.values where !user.isCurrentUser && !user.isFriend && !user.isBlocked && !memberIds.contains(user.serverId) {
            context.delete(user)
        }
    }

    /// Loads the chat members that aren't stored yet, e.g. after joining a group or when someone else joined one
    func loadMissingMembers() async throws {
        var local = try usersByServerId()
        try await loadMissingMembers(into: &local)
    }

    /// Loads the profiles of the other members of a chat again and whether they are friends, e.g. every few seconds
    /// in an open chat: the friends with one request, the other members one by one. Only stored users are updated,
    /// new members are inserted by `loadMissingMembers()` (both at once would insert a member twice). A member the
    /// server doesn't return (deleted, or blocked the current user) keeps the stored profile until the next full pull.
    func refreshMembers(of chat: Chat) async throws {
        let currentUserId = try currentUser()?.serverId
        let memberIds = Set(chat.members.map(\.userId)).subtracting(currentUserId.map { [$0] } ?? [])
        guard !memberIds.isEmpty else { return }
        var loaded: [Int: UserDTO] = [:]
        for dto in try await friendService.friends() {
            loaded[dto.id] = dto
        }
        let friendIds = Set(loaded.keys)
        for id in memberIds where loaded[id] == nil && !unavailableMemberIds.contains(id) {
            do {
                loaded[id] = try await userService.user(id: id)
            } catch {
                guard error.isRejection else { throw error }
                Logger.sync.info("Chat member \(id) could not be loaded: \(error.localizedDescription, privacy: .public)")
                unavailableMemberIds.insert(id)
            }
        }
        // Fetched after the requests, the users may have changed in the meantime
        let local = try usersByServerId()
        for id in memberIds {
            guard let user = local[id] else { continue }
            if let dto = loaded[id] {
                user.apply(dto)
            }
            if user.isFriend != friendIds.contains(id) {
                user.isFriend = friendIds.contains(id)
            }
        }
    }

    /// Returns the IDs of all chat members
    @discardableResult
    private func loadMissingMembers(into local: inout [Int: User]) async throws -> Set<Int> {
        let memberIds = Set(try context.fetchAll(ChatMember.self).map(\.userId))
        for id in memberIds where local[id] == nil && !unavailableMemberIds.contains(id) {
            do {
                upsert(try await userService.user(id: id), into: &local)
            } catch {
                // e.g. a deleted account or a user that blocked the current user
                guard error.isRejection else { throw error }
                Logger.sync.info("Chat member \(id) could not be loaded: \(error.localizedDescription, privacy: .public)")
                // Not requested again by every poll of the chats, only by the next full sync
                unavailableMemberIds.insert(id)
            }
        }
        return memberIds
    }

    @discardableResult
    private func upsert(_ dto: UserDTO, into local: inout [Int: User], includingSettings: Bool = true) -> User {
        if let user = local[dto.id] {
            user.apply(dto, includingSettings: includingSettings)
            return user
        }
        let user = User(dto)
        context.insert(user)
        local[dto.id] = user
        return user
    }

    private func usersByServerId() throws -> [Int: User] {
        Dictionary(try context.fetchAll(User.self).map { ($0.serverId, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private func currentUser() throws -> User? {
        try context.fetchAll(User.self).first { $0.isCurrentUser }
    }
}
