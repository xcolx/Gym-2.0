//
//  BlockedUsersViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation

/// Unblocking users, which needs a connection
@MainActor
@Observable
final class BlockedUsersViewModel {

    @ObservationIgnored private let friendService: (any FriendServicing)?
    @ObservationIgnored private let users: UserRepository

    /// The IDs of the users an unblock is running for
    var busyIds: Set<Int> = []
    var errorMessage: String?
    var reportTarget: ReportTarget?

    init(friendService: (any FriendServicing)?, users: UserRepository) {
        self.friendService = friendService
        self.users = users
    }

    func unblock(_ user: User) async {
        guard let friendService else { return }
        let userId = user.serverId
        busyIds.insert(userId)
        defer { busyIds.remove(userId) }
        do {
            try await friendService.unblock(userId: userId)
        } catch let error as APIError where error.status == 404 {
            // Already unblocked, e.g. on another device
        } catch {
            errorMessage = error.localizedDescription
            return
        }
        // The next pull removes the user if they're not a friend or in a chat with the current user
        user.isBlocked = false
        users.saveLoggingErrors("the unblocked user")
    }
}
