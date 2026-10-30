//
//  ChatService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import SwiftUI

extension EnvironmentValues {
    @Entry var chatService: ChatService? = nil
}

/// Direct and group chats and their messages against /chat.
///
/// There are no push updates yet: poll `changes(since:)` to receive new messages and read states.
final class ChatService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// All chats with all messages, for the first sync. Use `changes(since:)` with the returned sync time afterwards.
    func all() async throws -> ChatListDTO {
        try await api.send(.allChats)
    }

    /// The chats with new messages or new metadata since the sync time of the previous `all()` or `changes(since:)`,
    /// and the read state of all chats.
    func changes(since syncTime: String) async throws -> ChatDeltaDTO {
        try await api.send(.chatChanges(since: syncTime))
    }

    /// Starts a direct chat with a friend. If there already is one, that chat is returned.
    func createDirectChat(with userId: Int) async throws -> ChatDTO {
        try await api.send(.createChat(CreateChatRequest(userId: userId)))
    }

    /// Creates a group chat with the current user and the given friends. A public group can be created without them.
    func createGroupChat(name: String, memberIds: [Int], isPublic: Bool = false, image: ImageUpload? = nil) async throws -> ChatDTO {
        try await api.send(.createGroupChat(name: name, memberIds: memberIds, isPublic: isPublic, image: image))
    }

    /// Changes the name and/or image of a group chat. Only its admins can do this. Nil leaves a field unchanged.
    func updateGroupChat(id: Int, name: String? = nil, image: ImageUpload? = nil) async throws -> ChatDTO {
        try await api.send(.updateGroupChat(id: id, name: name, image: image))
    }

    /// Removes the image of a group chat. Only its admins can do this.
    func deleteGroupChatImage(id: Int) async throws -> ChatDTO {
        try await api.send(.deleteGroupChatImage(id: id))
    }

    /// Adds friends to a private group chat. Only its admins can do this, users that already are members are skipped.
    func addMembers(to chatId: Int, userIds: [Int]) async throws -> ChatDTO {
        try await api.send(.addMembers(chatId: chatId, AddMembersRequest(userIds: userIds)))
    }

    /// Removes a member from a private group chat. Only its admins can do this.
    /// With the current user's own ID it leaves the group, which also works for public groups.
    /// When the last admin leaves, a random other member becomes admin. A group without members is deleted.
    func removeMember(_ userId: Int, from chatId: Int) async throws {
        try await api.send(.removeMember(chatId: chatId, userId: userId))
    }

    /// Makes a member of a group chat an admin or removes their admin status. Only its admins can do this,
    /// the last admin can't remove their own admin status.
    func setAdmin(_ isAdmin: Bool, userId: Int, chatId: Int) async throws -> ChatDTO {
        try await api.send(.updateAdmin(chatId: chatId, userId: userId, UpdateAdminRequest(admin: isAdmin)))
    }

    /// Deletes a chat for all members. Both members of a direct chat can do this, a group only its admins.
    func deleteChat(id: Int) async throws {
        try await api.send(.deleteChat(id: id))
    }

    /// Deletes a message the current user sent (soft delete on the server). The other members' apps remove it with
    /// their next delta. Fails with 404 if it doesn't exist or is already deleted, 403 for a message of another user.
    func deleteMessage(id: Int) async throws {
        try await api.send(.deleteMessage(id: id))
    }

    /// Makes a group chat public or private. Only its admins can do this.
    func setPublic(_ isPublic: Bool, chatId: Int) async throws -> ChatDTO {
        try await api.send(.updatePublic(chatId: chatId, UpdatePublicRequest(public: isPublic)))
    }

    /// All public group chats with their members, but without messages.
    func publicChats() async throws -> [ChatDTO] {
        try await api.send(.publicChats)
    }

    /// Joins a public group chat and returns it with all its messages. If already a member, the chat is returned unchanged.
    func join(chatId: Int) async throws -> ChatDTO {
        try await api.send(.joinChat(id: chatId))
    }

    /// Sends text and/or a photo. At least one of them is required, the text can be up to 10'000 characters.
    /// If a message with the client UUID was already sent, that message is returned instead of sending it again.
    func sendMessage(to chatId: Int, text: String? = nil, image: ImageUpload? = nil, clientUuid: UUID? = nil) async throws -> MessageDTO {
        try await api.send(.sendMessage(chatId: chatId, text: text, image: image, clientUuid: clientUuid))
    }

    /// Marks all messages up to the given one as read. The read state only moves forward.
    func markRead(chatId: Int, upTo messageId: Int) async throws {
        try await api.send(.markRead(chatId: chatId, MarkReadRequest(messageId: messageId)))
    }
}

private extension Endpoint {
    static let allChats = Endpoint(method: .get, path: "/chats")
    static let publicChats = Endpoint(method: .get, path: "/chats/public")

    static func chatChanges(since syncTime: String) -> Endpoint {
        Endpoint(method: .get, path: "/chats/delta", queryItems: [URLQueryItem(name: "last_sync_time", value: syncTime)])
    }

    static func createChat(_ request: CreateChatRequest) -> Endpoint {
        Endpoint(method: .post, path: "/chats", body: .json(request))
    }

    static func createGroupChat(name: String, memberIds: [Int], isPublic: Bool, image: ImageUpload?) -> Endpoint {
        var form = MultipartFormData()
        form.append(name, name: "name")
        form.append(memberIds, name: "user_ids")
        form.append(isPublic, name: "public")
        if let image {
            form.appendFile(image.data, name: "image", filename: image.filename, mimeType: image.mimeType)
        }
        return Endpoint(method: .post, path: "/chats/groups", body: .multipart(form))
    }

    static func updateGroupChat(id: Int, name: String?, image: ImageUpload?) -> Endpoint {
        var form = MultipartFormData()
        if let name {
            form.append(name, name: "name")
        }
        if let image {
            form.appendFile(image.data, name: "image", filename: image.filename, mimeType: image.mimeType)
        }
        return Endpoint(method: .patch, path: "/chats/\(id)", body: .multipart(form))
    }

    static func deleteGroupChatImage(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/chats/\(id)/image")
    }

    static func addMembers(chatId: Int, _ request: AddMembersRequest) -> Endpoint {
        Endpoint(method: .post, path: "/chats/\(chatId)/members", body: .json(request))
    }

    static func removeMember(chatId: Int, userId: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/chats/\(chatId)/members/\(userId)")
    }

    static func updateAdmin(chatId: Int, userId: Int, _ request: UpdateAdminRequest) -> Endpoint {
        Endpoint(method: .patch, path: "/chats/\(chatId)/members/\(userId)", body: .json(request))
    }

    static func deleteChat(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/chats/\(id)")
    }

    static func deleteMessage(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/chats/messages/\(id)")
    }

    static func updatePublic(chatId: Int, _ request: UpdatePublicRequest) -> Endpoint {
        Endpoint(method: .patch, path: "/chats/\(chatId)/visibility", body: .json(request))
    }

    static func joinChat(id: Int) -> Endpoint {
        Endpoint(method: .post, path: "/chats/\(id)/members/me")
    }

    static func sendMessage(chatId: Int, text: String?, image: ImageUpload?, clientUuid: UUID?) -> Endpoint {
        var form = MultipartFormData()
        if let clientUuid {
            form.append(clientUuid.uuidString, name: "client_uuid")
        }
        if let text {
            form.append(text, name: "content")
        }
        if let image {
            form.appendFile(image.data, name: "image", filename: image.filename, mimeType: image.mimeType)
        }
        return Endpoint(method: .post, path: "/chats/\(chatId)/messages", body: .multipart(form))
    }

    static func markRead(chatId: Int, _ request: MarkReadRequest) -> Endpoint {
        Endpoint(method: .put, path: "/chats/\(chatId)/read-marker", body: .json(request))
    }
}
