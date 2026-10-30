//
//  ChatInfoViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation
import PhotosUI
import SwiftUI
import UIKit

/// The role of the current user in a chat, which decides the actions they have
struct ChatMembership {

    let chat: Chat
    let currentUserId: Int?

    var isAdmin: Bool {
        chat.groupChat && chat.members.contains { $0.userId == currentUserId && $0.admin == true }
    }

    /// Whether the current user is the group's only admin, so a random member becomes admin when they leave
    var isOnlyAdmin: Bool {
        isAdmin && !chat.members.contains { $0.userId != currentUserId && $0.admin == true }
    }

    /// Admins can remove other members (admins too) from private groups
    func canRemove(_ userId: Int) -> Bool {
        isAdmin && !chat.isPublic && userId != currentUserId
    }

    /// Admins can make other members admins and remove their admin status, also their own as long as another admin
    /// is left. Returns whether the member would become admin, or nil if it can't be changed.
    func adminChange(for member: ChatMember) -> Bool? {
        guard isAdmin else { return nil }
        if member.userId != currentUserId {
            return member.admin != true
        }
        return isOnlyAdmin ? nil : false
    }

    func status(of member: ChatMember, user: User?) -> String? {
        let relation: String? = if user?.isBlocked ?? false {
            "Blocked"
        } else if user?.isFriend ?? false {
            "Friend"
        } else {
            nil
        }
        guard chat.groupChat, member.admin == true else { return relation }
        return relation.map { "Admin · \($0)" } ?? "Admin"
    }

    /// The current user first, then by username
    func sortedMembers(users: [Int: User]) -> [ChatMember] {
        chat.members
            .filter { chat.groupChat || $0.userId != currentUserId }
            .sorted { a, b in
                if a.userId == currentUserId { return true }
                if b.userId == currentUserId { return false }
                return (users[a.userId]?.username ?? "").localizedCaseInsensitiveCompare(users[b.userId]?.username ?? "") == .orderedAscending
            }
    }
}

/// The changes of a chat in ChatInfoView. All need a connection, the stored chat is updated with the server's answer.
@MainActor
@Observable
final class ChatInfoViewModel {

    enum Confirmation {
        case remove(id: Int, username: String)
        case block(id: Int, username: String)
        case removeFromGroup(id: Int, username: String)
        case leave
        case delete
    }

    let chat: Chat
    @ObservationIgnored private let chatService: (any ChatServicing)?
    @ObservationIgnored private let syncService: any SyncServicing
    @ObservationIgnored private let actions: FriendActions?
    @ObservationIgnored private let chats: ChatRepository
    /// Goes back to the list of chats, e.g. after the chat was left or deleted
    @ObservationIgnored private let close: () -> Void
    @ObservationIgnored private let open: (Chat) -> Void

    var name = ""
    var selectedPhoto: PhotosPickerItem?
    var isSavingGroup = false
    /// The IDs of the users an action is running for
    var busyIds: Set<Int> = []
    var message: String?
    var errorMessage: String?
    var confirmation: Confirmation?
    var showsAddMembers = false
    var isChangingPublic = false
    var isLeaving = false
    var isDeleting = false
    var reportTarget: ReportTarget?

    init(chat: Chat, chatService: (any ChatServicing)?, syncService: any SyncServicing, actions: FriendActions?, chats: ChatRepository, close: @escaping () -> Void, open: @escaping (Chat) -> Void) {
        self.chat = chat
        self.chatService = chatService
        self.syncService = syncService
        self.actions = actions
        self.chats = chats
        self.close = close
        self.open = open
    }

    func onAppear() {
        name = chat.name ?? ""
    }

    var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var nameChanged: Bool {
        trimmedName != (chat.name ?? "")
    }

    var canSaveName: Bool {
        !trimmedName.isEmpty && trimmedName.count <= NewGroupChatViewModel.maxNameLength
    }

    func confirmationTitle() -> String {
        switch confirmation {
        case .remove(_, let username): "Remove \(username) as a friend?"
        case .block(_, let username): "Block \(username)?"
        case .removeFromGroup(_, let username): "Remove \(username) from the group?"
        case .leave: chat.members.count <= 1 ? "Leave and delete the group?" : "Leave the group?"
        case .delete: chat.groupChat ? "Delete the group?" : "Delete the chat?"
        case nil: ""
        }
    }

    // MARK: - Friend actions

    func removeFriend(id: Int) async {
        await run(for: id) { try await $0.removeFriend(id: id) }
    }

    func block(id: Int) async {
        await run(for: id) { actions in
            try await actions.block(id: id)
            self.didBlock()
        }
    }

    /// Blocks the user after the report of "Block and Report…"
    func blockAfterReport(id: Int) async throws {
        guard let actions else { return }
        try await actions.block(id: id)
        didBlock()
    }

    private func didBlock() {
        // The direct chat with a blocked user is hidden
        if !chat.groupChat {
            close()
        }
    }

    func sendRequest(to userId: Int) async {
        await run(for: userId) { actions in
            self.message = try await actions.sendRequest(to: userId)
        }
    }

    /// Opens the direct chat with a friend, created if there is none yet
    func openDirectChat(with userId: Int) async {
        await run(for: userId) { actions in
            self.open(try await actions.directChat(with: userId))
        }
    }

    private func run(for userId: Int, _ action: (FriendActions) async throws -> Void) async {
        guard let actions, !busyIds.contains(userId) else { return }
        busyIds.insert(userId)
        message = nil
        defer { busyIds.remove(userId) }
        do {
            try await action(actions)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Group

    func setPublic(_ isPublic: Bool) async {
        guard let chatService else { return }
        isChangingPublic = true
        defer { isChangingPublic = false }
        do {
            await syncService.store(try await chatService.setPublic(isPublic, chatId: chat.serverId))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setAdmin(_ isAdmin: Bool, userId: Int) async {
        guard let chatService, !busyIds.contains(userId) else { return }
        busyIds.insert(userId)
        defer { busyIds.remove(userId) }
        do {
            await syncService.store(try await chatService.setAdmin(isAdmin, userId: userId, chatId: chat.serverId))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeFromGroup(_ userId: Int) async {
        guard let chatService, !busyIds.contains(userId) else { return }
        busyIds.insert(userId)
        defer { busyIds.remove(userId) }
        do {
            try await chatService.removeMember(userId, from: chat.serverId)
        } catch let error as APIError where error.status == 404 {
            // Already removed, e.g. by another member
        } catch {
            errorMessage = error.localizedDescription
            return
        }
        // Removed right away, the next sync brings the server's members
        chats.removeMember(userId, from: chat)
    }

    func leave(currentUserId: Int?) async {
        guard let chatService, let currentUserId else { return }
        isLeaving = true
        defer { isLeaving = false }
        do {
            try await chatService.removeMember(currentUserId, from: chat.serverId)
        } catch let error as APIError where error.status == 404 || error.status == 403 {
            // Already removed, e.g. by another member
        } catch {
            errorMessage = error.localizedDescription
            return
        }
        close()
        chats.delete(chat)
    }

    func delete() async {
        guard let chatService else { return }
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await chatService.deleteChat(id: chat.serverId)
        } catch let error as APIError where error.status == 404 {
            // Already deleted, e.g. by the other member
        } catch {
            errorMessage = error.localizedDescription
            return
        }
        close()
        chats.delete(chat)
    }

    func saveName() async {
        guard canSaveName, nameChanged else { return }
        await updateGroup(name: trimmedName, image: nil)
    }

    func uploadGroupImage(from item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data),
              let upload = GroupImagePicker.upload(for: image)
        else {
            errorMessage = "The image could not be loaded."
            return
        }
        await updateGroup(name: nil, image: upload)
    }

    func updateGroup(name: String?, image: ImageUpload?) async {
        guard let chatService else { return }
        isSavingGroup = true
        defer { isSavingGroup = false }
        do {
            let dto = try await chatService.updateGroupChat(id: chat.serverId, name: name, image: image)
            await syncService.store(dto)
            self.name = dto.name ?? ""
        } catch {
            errorMessage = error.localizedDescription
            self.name = chat.name ?? ""
        }
    }

    func removeGroupImage() async {
        guard let chatService else { return }
        isSavingGroup = true
        defer { isSavingGroup = false }
        do {
            let dto = try await chatService.deleteGroupChatImage(id: chat.serverId)
            await syncService.store(dto)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Adds friends that aren't members yet to a private group
@MainActor
@Observable
final class AddMembersViewModel {

    let chat: Chat
    @ObservationIgnored private let chatService: (any ChatServicing)?
    @ObservationIgnored private let syncService: any SyncServicing

    var selectedIds: Set<Int> = []
    var isAdding = false
    var errorMessage: String?

    init(chat: Chat, chatService: (any ChatServicing)?, syncService: any SyncServicing) {
        self.chat = chat
        self.chatService = chatService
        self.syncService = syncService
    }

    func candidates(from friends: [User]) -> [User] {
        let memberIds = Set(chat.members.map(\.userId))
        return friends.filter { !memberIds.contains($0.serverId) }
    }

    func toggle(_ friend: User) {
        if selectedIds.contains(friend.serverId) {
            selectedIds.remove(friend.serverId)
        } else {
            selectedIds.insert(friend.serverId)
        }
    }

    /// Returns whether the members were added, the sheet is closed then
    func add(from friends: [User]) async -> Bool {
        guard let chatService, !selectedIds.isEmpty else { return false }
        isAdding = true
        defer { isAdding = false }
        do {
            let ids = candidates(from: friends).map(\.serverId).filter(selectedIds.contains)
            await syncService.store(try await chatService.addMembers(to: chat.serverId, userIds: ids))
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
