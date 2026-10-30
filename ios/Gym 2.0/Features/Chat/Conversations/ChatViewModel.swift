//
//  ChatViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 20.05.2025.
//

import Foundation
import Observation
import PhotosUI
import SwiftUI
import UIKit

/// The input of a chat, sending text and photos, deleting messages and polling for new ones.
///
/// Text is kept in `Chat.input` until the server accepted it, so it's sent again by the next sync if the server
/// couldn't be reached. Photos are only sent while online.
@MainActor
@Observable
final class ChatViewModel {

    /// No push updates yet, so an open chat polls for new messages
    static let pollInterval: Duration = .seconds(1)
    /// The polls don't load known members again, so their profiles and friendships are loaded this often
    static let membersRefreshInterval: Duration = .seconds(10)
    static let maxMessageLength = 10_000

    let chat: Chat
    @ObservationIgnored private let chatService: (any ChatServicing)?
    @ObservationIgnored private let syncService: any SyncServicing
    @ObservationIgnored private let chats: ChatRepository

    var draft = ""
    var isSending = false
    var selectedPhoto: PhotosPickerItem?
    var isSendingPhoto = false
    /// The picked photo, shown with a caption field before it's sent
    var photoToSend: PickedPhoto?
    /// The hash of the photo shown in full screen
    var viewedPhoto: ViewedPhoto?
    var errorMessage: String?
    var deleteErrorMessage: String?
    var reportTarget: ReportTarget?

    init(chat: Chat, chatService: (any ChatServicing)?, syncService: any SyncServicing, chats: ChatRepository) {
        self.chat = chat
        self.chatService = chatService
        self.syncService = syncService
        self.chats = chats
    }

    /// The text that was sent but not accepted by the server yet
    var isPending: Bool {
        chat.inputUUID != nil
    }

    var canSend: Bool {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !text.isEmpty && text.count <= Self.maxMessageLength && !isSending && !isPending
    }

    // MARK: - Lifecycle

    func onAppear() {
        if !isPending {
            draft = chat.input
        }
    }

    /// The draft is only stored when leaving, so that typing doesn't save (and sync) for every character
    func onDisappear() {
        guard chat.modelContext != nil, !chat.isDeleted else { return }
        if !isPending && chat.input != draft {
            chat.input = draft
        }
    }

    /// Marks the chat as read, then polls for new messages until the task is cancelled
    func poll() async {
        await syncService.markRead(chat)
        while !Task.isCancelled {
            try? await Task.sleep(for: Self.pollInterval)
            guard !Task.isCancelled else { return }
            await syncService.syncChats()
        }
    }

    /// Right away and then regularly, so that e.g. a changed profile image doesn't wait for the next sync
    func refreshMembers() async {
        while !Task.isCancelled {
            await syncService.refreshMembers(of: chat)
            try? await Task.sleep(for: Self.membersRefreshInterval)
        }
    }

    func markRead() async {
        await syncService.markRead(chat)
    }

    // MARK: - Text

    func send() async {
        guard canSend else { return }
        chat.input = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = ""
        await retry()
    }

    func retry() async {
        isSending = true
        await syncService.sendMessage(in: chat)
        isSending = false
        // A rejected message stays in the input field, without its UUID
        if !isPending && !chat.input.isEmpty && draft.isEmpty {
            draft = chat.input
        }
    }

    // MARK: - Deleting

    func delete(_ message: Message) async {
        let id = message.serverId
        do {
            try await deleteMessage(id)
        } catch {
            deleteErrorMessage = error.localizedDescription
        }
    }

    /// Deletes an own message (or, as an admin, a message of another member of the group) for everyone in the chat
    /// (online) and removes it here. The chat's preview of the latest message is updated by the next poll.
    func deleteMessage(_ id: Int) async throws {
        guard let chatService else { return }
        do {
            try await chatService.deleteMessage(id: id)
        } catch let error as APIError where error.status == 404 {
            // Already deleted, e.g. on another device
        }
        // A poll may have removed it in the meantime
        guard let message = chat.messages.first(where: { $0.serverId == id }), !message.isDeleted else { return }
        chats.delete(message)
    }

    // MARK: - Photos

    func loadPhoto(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
            errorMessage = "The photo could not be loaded."
            return
        }
        photoToSend = PickedPhoto(image: image)
    }

    func sendPhoto(_ image: UIImage, caption: String?) async {
        guard let upload = Self.photoUpload(from: image) else {
            errorMessage = "The photo could not be loaded."
            return
        }
        isSendingPhoto = true
        defer { isSendingPhoto = false }
        do {
            try await syncService.sendPhoto(upload, caption: caption, in: chat)
        } catch {
            errorMessage = "The photo could not be sent: \(error.localizedDescription)"
        }
    }

    /// Scaled down to the size the server stores (2048 px), so that big photos don't take long to upload
    static func photoUpload(from image: UIImage) -> ImageUpload? {
        let maxDimension: CGFloat = 2048
        let scale = min(1, maxDimension / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let scaled = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return scaled.jpegData(compressionQuality: 0.85).map { ImageUpload(data: $0) }
    }
}

struct ViewedPhoto: Identifiable {
    let hash: String
    var id: String { hash }
}

struct PickedPhoto: Identifiable {
    let id = UUID()
    let image: UIImage
}
