//
//  ServiceFakes.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 22.10.2026.
//
//  Services for the view models that answer without a server and note what they were asked. A test sets `failure`
//  to make the calls throw.
//

import Foundation
@testable import Gym_2_0

/// A server error like the backend sends it
func serverError(_ status: Int, code: String? = nil, _ message: String = "Something went wrong") -> APIError {
    .server(status: status, code: code, message: message)
}

/// A chat as the server returns it, ChatDTO only has a decoder initializer
func chatDTO(id: Int = 4, groupChat: Bool = true, name: String? = "Gym", isPublic: Bool = false, members: [(userId: Int, admin: Bool?)] = [], latestMessageTimestamp: String? = nil) -> ChatDTO {
    let members = members.map { #"{"userId": \#($0.userId), "lastReadMessageId": 0, "admin": \#($0.admin.map(String.init) ?? "null")}"# }
    let json = """
        {"id": \(id), "groupChat": \(groupChat), "name": \(name.map { "\"\($0)\"" } ?? "null"), "createdAt": "2026-10-01T08:00:00Z",
         "createdBy": 1, "public": \(isPublic), "members": [\(members.joined(separator: ","))],
         "latestMessageTimestamp": \(latestMessageTimestamp.map { "\"\($0)\"" } ?? "null")}
        """
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try! decoder.decode(ChatDTO.self, from: Data(json.utf8))
}

@MainActor
final class FakeAuthService: AuthServicing {
    var currentUser: UserDTO?
    var failure: Error?
    var logins: [(email: String, password: String)] = []
    var signUps: [(email: String, password: String, username: String)] = []
    var resentTo: [String] = []
    var resetEmails: [String] = []
    var logoutCount = 0
    var refreshCount = 0

    func login(email: String, password: String) async throws {
        logins.append((email, password))
        if let failure { throw failure }
    }

    func signUp(email: String, password: String, username: String) async throws -> String {
        signUps.append((email, password, username))
        if let failure { throw failure }
        return "Account created."
    }

    func resendVerificationEmail(to email: String) async throws -> String {
        resentTo.append(email)
        if let failure { throw failure }
        return "Email sent."
    }

    func forgotPassword(email: String) async throws -> String {
        resetEmails.append(email)
        if let failure { throw failure }
        return "Check your emails."
    }

    func logout() async {
        logoutCount += 1
    }

    func refreshCurrentUser() async throws {
        refreshCount += 1
    }
}

@MainActor
final class FakeSyncService: SyncServicing {
    var hasUnpushedChanges = false
    /// What pushPendingChanges returns, it also clears hasUnpushedChanges when true
    var pushSucceeds = true
    var pushCount = 0
    var syncCount = 0
    var deleteLocalDataCount = 0
    var storedChats: [ChatDTO] = []
    var markReadCount = 0
    /// The texts sendMessage sent, the server accepts them unless `rejectsMessages`
    var sentMessages: [String] = []
    var rejectsMessages = false
    var photoFailure: Error?
    var sentPhotos: [String?] = []

    func sync() async {
        syncCount += 1
    }

    func pushPendingChanges() async -> Bool {
        pushCount += 1
        if pushSucceeds { hasUnpushedChanges = false }
        return pushSucceeds
    }

    func deleteLocalData() async {
        deleteLocalDataCount += 1
    }

    func store(_ dto: ChatDTO) async {
        storedChats.append(dto)
    }

    func syncChats() async {}
    func refreshMembers(of chat: Chat) async {}

    func markRead(_ chat: Chat) async {
        markReadCount += 1
    }

    /// Like SyncService: an accepted message leaves the input, a rejected one stays in it without its UUID
    func sendMessage(in chat: Chat) async {
        sentMessages.append(chat.input)
        chat.inputUUID = nil
        if !rejectsMessages {
            chat.input = ""
        }
    }

    func sendPhoto(_ upload: ImageUpload, caption: String?, in chat: Chat) async throws {
        if let photoFailure { throw photoFailure }
        sentPhotos.append(caption)
    }
}

final class FakeUserService: UserServicing {
    var failure: Error?
    var profileImage = ProfileImageDTO(success: true, imageUrl: "image-hash", iconUrl: "icon-hash", message: nil)
    var takeout = Data("zip".utf8)
    var usernames: [String] = []
    var emailChanges: [(email: String, password: String)] = []
    var passwordChanges: [(current: String, new: String)] = []
    var deletedWithPasswords: [String] = []
    var deletedProfileImage = false

    private func check() throws {
        if let failure { throw failure }
    }

    func user(username: String) async throws -> UserDTO {
        try check()
        return userDTO(username: username)
    }

    func updateProfileImage(_ image: ImageUpload) async throws -> ProfileImageDTO {
        try check()
        return profileImage
    }

    func deleteProfileImage() async throws {
        try check()
        deletedProfileImage = true
    }

    func changeUsername(to username: String) async throws -> UpdateResultDTO {
        usernames.append(username)
        try check()
        return UpdateResultDTO(success: true, message: nil)
    }

    func changePassword(from currentPassword: String, to newPassword: String) async throws -> UpdateResultDTO {
        passwordChanges.append((currentPassword, newPassword))
        try check()
        return UpdateResultDTO(success: true, message: nil)
    }

    func changeEmail(to email: String, password: String) async throws -> UpdateResultDTO {
        emailChanges.append((email, password))
        try check()
        return UpdateResultDTO(success: true, message: nil)
    }

    func deleteAccount(password: String) async throws {
        deletedWithPasswords.append(password)
        try check()
    }

    func dataTakeout() async throws -> Data {
        try check()
        return takeout
    }
}

final class FakeFriendService: FriendServicing {
    var failure: Error?
    var requests: [FriendRequestDTO] = []
    var sentRequests: [SentFriendRequestDTO] = []
    /// The friend the answer to a request returns
    var newFriend: UserDTO?
    var blocked: [Int] = []
    var unblocked: [Int] = []
    var removedFriends: [Int] = []
    var requestsSentTo: [Int] = []
    var answers: [(senderId: Int, accept: Bool)] = []
    var cancelledRequestsTo: [Int] = []

    private func check() throws {
        if let failure { throw failure }
    }

    func removeFriend(id: Int) async throws {
        try check()
        removedFriends.append(id)
    }

    func friendRequests() async throws -> [FriendRequestDTO] {
        try check()
        return requests
    }

    func sentFriendRequests() async throws -> [SentFriendRequestDTO] {
        try check()
        return sentRequests
    }

    func sendFriendRequest(to userId: Int) async throws -> UpdateResultDTO {
        try check()
        requestsSentTo.append(userId)
        return UpdateResultDTO(success: true, message: "Friend request sent to the user.")
    }

    func answerFriendRequest(from senderId: Int, accept: Bool) async throws -> FriendRequestAnswerDTO {
        try check()
        answers.append((senderId, accept))
        return FriendRequestAnswerDTO(success: true, message: nil, newFriend: accept ? newFriend : nil)
    }

    func deleteFriendRequest(with userId: Int) async throws {
        try check()
        cancelledRequestsTo.append(userId)
    }

    func block(userId: Int) async throws -> UpdateResultDTO {
        try check()
        blocked.append(userId)
        return UpdateResultDTO(success: true, message: nil)
    }

    func unblock(userId: Int) async throws {
        try check()
        unblocked.append(userId)
    }
}

final class FakeChatService: ChatServicing {
    var failure: Error?
    /// The chat the calls that return one answer with
    var chat = chatDTO()
    var removedMembers: [(userId: Int, chatId: Int)] = []
    var deletedChats: [Int] = []
    var groupUpdates: [(id: Int, name: String?, hasImage: Bool)] = []
    var adminChanges: [(isAdmin: Bool, userId: Int)] = []
    var publicChanges: [Bool] = []
    var addedMembers: [[Int]] = []
    /// What publicChats returns, `[chat]` if nil
    var publicGroups: [ChatDTO]?
    var joined: [Int] = []
    var deletedMessages: [Int] = []

    private func check() throws {
        if let failure { throw failure }
    }

    func createDirectChat(with userId: Int) async throws -> ChatDTO {
        try check()
        return chat
    }

    func createGroupChat(name: String, memberIds: [Int], isPublic: Bool, image: ImageUpload?) async throws -> ChatDTO {
        try check()
        return chat
    }

    func updateGroupChat(id: Int, name: String?, image: ImageUpload?) async throws -> ChatDTO {
        groupUpdates.append((id, name, image != nil))
        try check()
        return chatDTO(id: id, name: name ?? chat.name)
    }

    func deleteGroupChatImage(id: Int) async throws -> ChatDTO {
        try check()
        return chat
    }

    func addMembers(to chatId: Int, userIds: [Int]) async throws -> ChatDTO {
        addedMembers.append(userIds)
        try check()
        return chat
    }

    func removeMember(_ userId: Int, from chatId: Int) async throws {
        removedMembers.append((userId, chatId))
        try check()
    }

    func setAdmin(_ isAdmin: Bool, userId: Int, chatId: Int) async throws -> ChatDTO {
        adminChanges.append((isAdmin, userId))
        try check()
        return chat
    }

    func deleteChat(id: Int) async throws {
        deletedChats.append(id)
        try check()
    }

    func deleteMessage(id: Int) async throws {
        deletedMessages.append(id)
        try check()
    }

    func setPublic(_ isPublic: Bool, chatId: Int) async throws -> ChatDTO {
        publicChanges.append(isPublic)
        try check()
        return chat
    }

    func publicChats() async throws -> [ChatDTO] {
        try check()
        return publicGroups ?? [chat]
    }

    func join(chatId: Int) async throws -> ChatDTO {
        try check()
        joined.append(chatId)
        return chat
    }
}
