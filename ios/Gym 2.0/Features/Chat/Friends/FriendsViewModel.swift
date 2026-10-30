//
//  FriendsViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 12.05.2025.
//

import Foundation
import Observation

/// Finding users, the friend requests and the actions for friends in FriendsView. All need a connection.
@MainActor
@Observable
final class FriendsViewModel {

    enum Confirmation: Identifiable {
        case remove(id: Int, username: String)
        case block(id: Int, username: String, profile: UserDTO?)

        var id: String {
            switch self {
            case .remove(let id, _): "remove\(id)"
            case .block(let id, _, _): "block\(id)"
            }
        }
    }

    @ObservationIgnored private let friendService: (any FriendServicing)?
    @ObservationIgnored private let userService: (any UserServicing)?
    @ObservationIgnored private let syncService: any SyncServicing
    @ObservationIgnored private let actions: FriendActions?
    @ObservationIgnored private let openChat: (Chat) -> Void

    var requests: [FriendRequestDTO] = []
    var sentRequests: [SentFriendRequestDTO] = []
    var requestsError: String?

    var searchText = ""
    var foundUser: UserDTO?
    var searchMessage: String?
    var isSearching = false

    /// The IDs of the users an action is running for
    var busyIds: Set<Int> = []
    var errorMessage: String?
    var confirmation: Confirmation?
    var reportTarget: ReportTarget?

    init(friendService: (any FriendServicing)?, userService: (any UserServicing)?, syncService: any SyncServicing, actions: FriendActions?, openChat: @escaping (Chat) -> Void) {
        self.friendService = friendService
        self.userService = userService
        self.syncService = syncService
        self.actions = actions
        self.openChat = openChat
    }

    var confirmationTitle: String {
        switch confirmation {
        case .remove(_, let username): "Remove \(username) as a friend?"
        case .block(_, let username, _): "Block \(username)?"
        case nil: ""
        }
    }

    /// Loads the requests again and syncs the friends
    func refresh() async {
        await loadRequests()
        await syncService.sync()
    }

    func loadRequests() async {
        guard let friendService else { return }
        do {
            requests = try await friendService.friendRequests()
            sentRequests = try await friendService.sentFriendRequests()
            requestsError = nil
        } catch {
            requestsError = "Friend requests could not be loaded: \(error.localizedDescription)"
        }
    }

    // MARK: - Search

    func search() async {
        let username = searchText.trimmingCharacters(in: .whitespaces)
        guard !username.isEmpty, let userService else { return }
        isSearching = true
        foundUser = nil
        searchMessage = nil
        defer { isSearching = false }
        do {
            foundUser = try await userService.user(username: username)
        } catch let error as APIError where error.status == 404 || error.status == 403 || error.status == 422 {
            // 403: one of the two blocked the other
            searchMessage = "No user found with that username."
        } catch {
            searchMessage = error.localizedDescription
        }
    }

    // MARK: - Actions

    func sendRequest(to userId: Int) async {
        await run(for: userId) { actions in
            self.searchMessage = try await actions.sendRequest(to: userId)
            await self.loadRequests()
        }
    }

    func cancelRequest(to userId: Int) async {
        await run(for: userId) { actions in
            try await actions.cancelRequest(to: userId)
            self.sentRequests.removeAll { $0.receiver.id == userId }
            self.searchMessage = nil
        }
    }

    func answer(_ request: FriendRequestDTO, accept: Bool) async {
        await run(for: request.sender.id) { actions in
            do {
                try await actions.answerRequest(from: request.sender, accept: accept)
            } catch let error as APIError where error.status == 404 {
                // Already answered or cancelled, e.g. on another device
            }
            self.requests.removeAll { $0.sender.id == request.sender.id }
        }
    }

    func removeFriend(id: Int) async {
        await run(for: id) { try await $0.removeFriend(id: id) }
    }

    func block(id: Int, profile: UserDTO?) async {
        await run(for: id) { actions in
            try await actions.block(id: id, profile: profile)
            self.requests.removeAll { $0.sender.id == id }
        }
    }

    /// Blocks the user after the report of "Block and Report…"
    func blockAfterReport(id: Int, profile: UserDTO?) async throws {
        guard let actions else { return }
        try await actions.block(id: id, profile: profile)
        requests.removeAll { $0.sender.id == id }
    }

    /// Opens the direct chat with the friend, created if there is none yet
    func openDirectChat(with friendId: Int) async {
        await run(for: friendId) { actions in
            let chat = try await actions.directChat(with: friendId)
            self.openChat(chat)
        }
    }

    private func run(for userId: Int, _ action: (FriendActions) async throws -> Void) async {
        guard let actions, !busyIds.contains(userId) else { return }
        busyIds.insert(userId)
        defer { busyIds.remove(userId) }
        do {
            try await action(actions)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
