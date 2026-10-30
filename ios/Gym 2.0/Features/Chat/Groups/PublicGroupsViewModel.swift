//
//  PublicGroupsViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation

/// A group with blocked members, joined only once the user confirmed the warning
struct PendingJoin {
    let group: ChatDTO
    let warning: String
}

/// Loading the public group chats online and joining them
@MainActor
@Observable
final class PublicGroupsViewModel {

    @ObservationIgnored private let chatService: (any ChatServicing)?
    @ObservationIgnored private let syncService: any SyncServicing
    @ObservationIgnored private let chats: ChatRepository
    @ObservationIgnored private let openChat: (Chat) -> Void

    var groups: [ChatDTO]?
    var loadError: String?
    var searchText = ""
    var joiningId: Int?
    var errorMessage: String?
    var pendingJoin: PendingJoin?
    var reportTarget: ReportTarget?

    init(chatService: (any ChatServicing)?, syncService: any SyncServicing, chats: ChatRepository, openChat: @escaping (Chat) -> Void) {
        self.chatService = chatService
        self.syncService = syncService
        self.chats = chats
        self.openChat = openChat
    }

    /// The latest active first, filtered by the search
    var filteredGroups: [ChatDTO] {
        let groups = (groups ?? []).sorted { ($0.latestMessageTimestamp ?? $0.createdAt) > ($1.latestMessageTimestamp ?? $1.createdAt) }
        let search = searchText.trimmingCharacters(in: .whitespaces)
        guard !search.isEmpty else { return groups }
        return groups.filter { ($0.name ?? "").localizedCaseInsensitiveContains(search) }
    }

    func load() async {
        guard let chatService else { return }
        do {
            groups = try await chatService.publicChats()
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// Opens a joined group, otherwise joins it, after a warning if the user blocked some of its members
    func open(_ group: ChatDTO, joined: Bool, blockedUsers: [User]) async {
        if joined, let chat = chats.chat(serverId: group.id) {
            openChat(chat)
            return
        }
        if let warning = Self.blockedMembersWarning(group, blockedUsers: blockedUsers) {
            pendingJoin = PendingJoin(group: group, warning: warning)
            return
        }
        await join(group)
    }

    func join(_ group: ChatDTO) async {
        guard let chatService else { return }
        joiningId = group.id
        defer { joiningId = nil }
        do {
            let dto = try await chatService.join(chatId: group.id)
            await syncService.store(dto)
            if let chat = chats.chat(serverId: dto.id) {
                openChat(chat)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Nil if the group has no members the user blocked. Blocking only hides the direct chat, so in a group both see
    /// each other's messages.
    static func blockedMembersWarning(_ group: ChatDTO, blockedUsers: [User]) -> String? {
        let memberIds = Set(group.members.map(\.userId))
        let names = blockedUsers.filter { memberIds.contains($0.serverId) }.map(\.username)
        guard !names.isEmpty else { return nil }
        let list = names.formatted(.list(type: .and).locale(Locale(identifier: "en_US")))
        return "\(list), who you blocked, \(names.count == 1 ? "is a member" : "are members") of this group. In a group you see each other's messages."
    }
}
