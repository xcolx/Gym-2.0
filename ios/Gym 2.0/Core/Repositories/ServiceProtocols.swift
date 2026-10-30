//
//  ServiceProtocols.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//
//  The parts of the services that the view models use. The view models get the services of the environment, the
//  tests fakes that don't need a server.
//

import Foundation

@MainActor
protocol AuthServicing: AnyObject {
    var currentUser: UserDTO? { get }
    func login(email: String, password: String) async throws
    func signUp(email: String, password: String, username: String) async throws -> String
    func resendVerificationEmail(to email: String) async throws -> String
    func forgotPassword(email: String) async throws -> String
    func logout() async
    func refreshCurrentUser() async throws
}

extension AuthService: AuthServicing {}

protocol UserServicing: AnyObject {
    func user(username: String) async throws -> UserDTO
    func updateProfileImage(_ image: ImageUpload) async throws -> ProfileImageDTO
    func deleteProfileImage() async throws
    func changeUsername(to username: String) async throws -> UpdateResultDTO
    func changePassword(from currentPassword: String, to newPassword: String) async throws -> UpdateResultDTO
    func changeEmail(to email: String, password: String) async throws -> UpdateResultDTO
    func deleteAccount(password: String) async throws
    func dataTakeout() async throws -> Data
}

extension UserService: UserServicing {}

protocol FriendServicing: AnyObject {
    func removeFriend(id: Int) async throws
    func friendRequests() async throws -> [FriendRequestDTO]
    func sentFriendRequests() async throws -> [SentFriendRequestDTO]
    func sendFriendRequest(to userId: Int) async throws -> UpdateResultDTO
    func answerFriendRequest(from senderId: Int, accept: Bool) async throws -> FriendRequestAnswerDTO
    func deleteFriendRequest(with userId: Int) async throws
    func block(userId: Int) async throws -> UpdateResultDTO
    func unblock(userId: Int) async throws
}

extension FriendService: FriendServicing {}

protocol ChatServicing: AnyObject {
    func createDirectChat(with userId: Int) async throws -> ChatDTO
    func createGroupChat(name: String, memberIds: [Int], isPublic: Bool, image: ImageUpload?) async throws -> ChatDTO
    func updateGroupChat(id: Int, name: String?, image: ImageUpload?) async throws -> ChatDTO
    func deleteGroupChatImage(id: Int) async throws -> ChatDTO
    func addMembers(to chatId: Int, userIds: [Int]) async throws -> ChatDTO
    func removeMember(_ userId: Int, from chatId: Int) async throws
    func setAdmin(_ isAdmin: Bool, userId: Int, chatId: Int) async throws -> ChatDTO
    func deleteChat(id: Int) async throws
    func deleteMessage(id: Int) async throws
    func setPublic(_ isPublic: Bool, chatId: Int) async throws -> ChatDTO
    func publicChats() async throws -> [ChatDTO]
    func join(chatId: Int) async throws -> ChatDTO
}

extension ChatService: ChatServicing {}

@MainActor
protocol SyncServicing: AnyObject {
    var hasUnpushedChanges: Bool { get }
    func sync() async
    func pushPendingChanges() async -> Bool
    func deleteLocalData() async
    /// Stores a chat the server returned, e.g. after a change
    func store(_ dto: ChatDTO) async
    func syncChats() async
    func refreshMembers(of chat: Chat) async
    func markRead(_ chat: Chat) async
    /// Sends the text in `Chat.input`
    func sendMessage(in chat: Chat) async
    func sendPhoto(_ upload: ImageUpload, caption: String?, in chat: Chat) async throws
}

extension SyncService: SyncServicing {}
