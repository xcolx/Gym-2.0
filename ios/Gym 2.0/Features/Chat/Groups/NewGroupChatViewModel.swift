//
//  NewGroupChatViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation
import PhotosUI
import SwiftUI
import UIKit

/// The input of a new group chat and creating it online
@MainActor
@Observable
final class NewGroupChatViewModel {

    /// The group that was created, `chat` is nil if it couldn't be found in the store afterwards
    struct Created {
        let chat: Chat?
    }

    static let maxNameLength = 25

    @ObservationIgnored private let chatService: (any ChatServicing)?
    @ObservationIgnored private let syncService: any SyncServicing
    @ObservationIgnored private let chats: ChatRepository

    var name = ""
    var isPublic = false
    var selectedIds: Set<Int> = []
    var image: UIImage?
    var selectedPhoto: PhotosPickerItem?
    var isCreating = false
    var errorMessage: String?

    init(chatService: (any ChatServicing)?, syncService: any SyncServicing, chats: ChatRepository) {
        self.chatService = chatService
        self.syncService = syncService
        self.chats = chats
    }

    var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var canCreate: Bool {
        !trimmedName.isEmpty && trimmedName.count <= Self.maxNameLength && (isPublic || !selectedIds.isEmpty) && !isCreating
    }

    func toggle(_ friend: User) {
        if selectedIds.contains(friend.serverId) {
            selectedIds.remove(friend.serverId)
        } else {
            selectedIds.insert(friend.serverId)
        }
    }

    func loadSelectedPhoto() async {
        guard let selectedPhoto else { return }
        if let data = try? await selectedPhoto.loadTransferable(type: Data.self), let picked = UIImage(data: data) {
            image = picked
        } else {
            errorMessage = "The image could not be loaded."
        }
        self.selectedPhoto = nil
    }

    /// Creates the group with the selected friends, in the order of `friends`. Nil if it wasn't created.
    func create(friends: [User]) async -> Created? {
        guard canCreate, let chatService else { return nil }
        isCreating = true
        defer { isCreating = false }
        do {
            let dto = try await chatService.createGroupChat(
                name: trimmedName,
                memberIds: friends.map(\.serverId).filter(selectedIds.contains),
                isPublic: isPublic,
                image: image.flatMap(GroupImagePicker.upload(for:))
            )
            await syncService.store(dto)
            return Created(chat: chats.chat(serverId: dto.id))
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }
}
