//
//  SocialViewModelsTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 24.10.2026.
//
//  Sending and deleting messages in a chat, the friends and their requests, unblocking and joining public groups
//

import Foundation
import SwiftData
import Testing
import UIKit
@testable import Gym_2_0

@MainActor
@Suite struct SocialViewModelsTests {

    let store: TestStore
    let chatService = FakeChatService()
    let friendService = FakeFriendService()
    let userService = FakeUserService()
    let sync = FakeSyncService()

    var chats: ChatRepository { ChatRepository(context: store.context) }
    var users: UserRepository { UserRepository(context: store.context) }
    var actions: FriendActions {
        FriendActions(friendService: friendService, chatService: chatService, syncService: sync, users: users, chats: chats)
    }

    init() throws {
        store = try TestStore()
    }

    @discardableResult
    func storedChat(serverId: Int = 4, messages: [Int] = []) throws -> Chat {
        let chat = Chat(serverId: serverId, groupChat: false, createdAt: isoDate("2026-10-01T08:00:00Z"))
        store.context.insert(chat)
        chat.messages = messages.map { id in
            let message = Message(serverId: id, chat: chat, senderId: 1, createdAt: isoDate("2026-10-01T09:00:00Z"), content: "Message \(id)")
            store.context.insert(message)
            return message
        }
        try store.context.save()
        return chat
    }

    @discardableResult
    func storedUser(_ id: Int, _ username: String, friend: Bool = false, blocked: Bool = false) throws -> User {
        let user = User(serverId: id, username: username, profileImageUrl: "", profileIconUrl: "")
        user.isFriend = friend
        user.isBlocked = blocked
        store.context.insert(user)
        try store.context.save()
        return user
    }

    // MARK: - ChatViewModel

    func chatModel(_ chat: Chat) -> ChatViewModel {
        ChatViewModel(chat: chat, chatService: chatService, syncService: sync, chats: chats)
    }

    @Test func sendsTheTrimmedDraftAndEmptiesTheField() async throws {
        let model = chatModel(try storedChat())
        model.draft = "  Leg day?\n"

        await model.send()

        #expect(sync.sentMessages == ["Leg day?"])
        #expect(model.draft == "")
        #expect(!model.isSending)
    }

    @Test func putsARejectedMessageBackIntoTheField() async throws {
        let chat = try storedChat()
        let model = chatModel(chat)
        sync.rejectsMessages = true
        model.draft = "Not allowed"

        await model.send()

        #expect(model.draft == "Not allowed")
        #expect(!model.isPending)
    }

    @Test func canOnlySendAValidTextWhileNothingIsPending() throws {
        let chat = try storedChat()
        let model = chatModel(chat)

        model.draft = "   "
        #expect(!model.canSend)
        model.draft = String(repeating: "a", count: ChatViewModel.maxMessageLength + 1)
        #expect(!model.canSend)
        model.draft = "Hi"
        #expect(model.canSend)

        chat.inputUUID = UUID()
        #expect(model.isPending)
        #expect(!model.canSend)
    }

    @Test func keepsTheDraftInTheChatWhenLeaving() throws {
        let chat = try storedChat()
        chat.input = "Started earlier"
        let model = chatModel(chat)

        model.onAppear()
        #expect(model.draft == "Started earlier")

        model.draft = "Changed"
        model.onDisappear()
        #expect(chat.input == "Changed")
    }

    @Test func deletesAMessageAlsoIfItWasAlreadyDeletedOnTheServer() async throws {
        let chat = try storedChat(messages: [10, 11])
        let model = chatModel(chat)

        await model.delete(chat.messages.first { $0.serverId == 10 }!)
        chatService.failure = serverError(404, code: "MessageNotFoundError")
        await model.delete(chat.messages.first { $0.serverId == 11 }!)

        #expect(chatService.deletedMessages == [10, 11])
        #expect(try store.context.fetchAll(Message.self).isEmpty)
        #expect(model.deleteErrorMessage == nil)
    }

    @Test func keepsTheMessageIfTheDeletionFailed() async throws {
        let chat = try storedChat(messages: [10])
        let model = chatModel(chat)
        chatService.failure = serverError(403, "Only admins can delete messages of others.")

        await model.delete(chat.messages[0])

        #expect(model.deleteErrorMessage == "Only admins can delete messages of others.")
        #expect(try store.context.fetchAll(Message.self).count == 1)
    }

    @Test func sendsAPhotoWithItsCaptionOrShowsTheError() async throws {
        let model = chatModel(try storedChat())
        let image = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 10, height: 10))
        }

        await model.sendPhoto(image, caption: "Form check")
        #expect(sync.sentPhotos == ["Form check"])
        #expect(model.errorMessage == nil)

        sync.photoFailure = serverError(413, "Too large")
        await model.sendPhoto(image, caption: nil)
        #expect(model.errorMessage == "The photo could not be sent: Too large")
        #expect(!model.isSendingPhoto)
    }

    @Test func scalesPhotosDownToTheSizeTheServerStores() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4096, height: 1024), format: {
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            return format
        }()).image { _ in }

        let upload = try #require(ChatViewModel.photoUpload(from: image))
        let scaled = try #require(UIImage(data: upload.data))

        #expect(scaled.size == CGSize(width: 2048, height: 512))
    }

    // MARK: - FriendsViewModel

    func friendsModel(opened: @escaping (Chat) -> Void = { _ in }) -> FriendsViewModel {
        FriendsViewModel(friendService: friendService, userService: userService, syncService: sync, actions: actions, openChat: opened)
    }

    @Test func loadsTheRequestsAndSyncsTheFriends() async {
        friendService.requests = [FriendRequestDTO(sender: userDTO(id: 2, username: "anna"), timestamp: .now)]
        friendService.sentRequests = [SentFriendRequestDTO(receiver: userDTO(id: 3, username: "ben"), timestamp: .now)]
        let model = friendsModel()

        await model.refresh()

        #expect(model.requests.map(\.sender.username) == ["anna"])
        #expect(model.sentRequests.map(\.receiver.username) == ["ben"])
        #expect(sync.syncCount == 1)
    }

    @Test func explainsWhyTheRequestsCouldntBeLoaded() async {
        friendService.failure = serverError(500, "Server down")
        let model = friendsModel()

        await model.loadRequests()

        #expect(model.requestsError == "Friend requests could not be loaded: Server down")
    }

    @Test func findsAUserByTheTrimmedUsername() async {
        let model = friendsModel()
        model.searchText = " anna "

        await model.search()

        #expect(model.foundUser?.username == "anna")
        #expect(model.searchMessage == nil)
        #expect(!model.isSearching)
    }

    @Test(arguments: [404, 403, 422])
    func saysNoUserWasFoundWithoutRevealingABlock(status: Int) async {
        userService.failure = serverError(status)
        let model = friendsModel()
        model.searchText = "anna"

        await model.search()

        #expect(model.foundUser == nil)
        #expect(model.searchMessage == "No user found with that username.")
    }

    @Test func acceptsARequestAndStoresTheNewFriend() async throws {
        let anna = userDTO(id: 2, username: "anna")
        friendService.requests = [FriendRequestDTO(sender: anna, timestamp: .now)]
        friendService.newFriend = anna
        let model = friendsModel()
        await model.loadRequests()

        await model.answer(model.requests[0], accept: true)

        #expect(friendService.answers.map(\.accept) == [true])
        #expect(model.requests.isEmpty)
        #expect(users.user(serverId: 2)?.isFriend == true)
        #expect(model.busyIds.isEmpty)
    }

    @Test func removesARequestThatWasAlreadyAnsweredElsewhere() async {
        friendService.requests = [FriendRequestDTO(sender: userDTO(id: 2, username: "anna"), timestamp: .now)]
        let model = friendsModel()
        await model.loadRequests()
        friendService.failure = serverError(404)

        await model.answer(model.requests[0], accept: false)

        #expect(model.requests.isEmpty)
        #expect(model.errorMessage == nil)
    }

    @Test func sendsAndCancelsARequest() async {
        friendService.sentRequests = [SentFriendRequestDTO(receiver: userDTO(id: 3, username: "ben"), timestamp: .now)]
        let model = friendsModel()

        await model.sendRequest(to: 3)
        #expect(friendService.requestsSentTo == [3])
        #expect(model.searchMessage == "Friend request sent to the user.")
        #expect(model.sentRequests.count == 1)

        await model.cancelRequest(to: 3)
        #expect(friendService.cancelledRequestsTo == [3])
        #expect(model.sentRequests.isEmpty)
    }

    @Test func removesAndBlocksFriends() async throws {
        try storedUser(2, "anna", friend: true)
        try storedUser(3, "ben", friend: true)
        friendService.requests = [FriendRequestDTO(sender: userDTO(id: 3, username: "ben"), timestamp: .now)]
        let model = friendsModel()
        await model.loadRequests()

        await model.removeFriend(id: 2)
        await model.block(id: 3, profile: nil)

        #expect(users.user(serverId: 2)?.isFriend == false)
        #expect(users.user(serverId: 3)?.isBlocked == true)
        #expect(users.user(serverId: 3)?.isFriend == false)
        #expect(model.requests.isEmpty)
    }

    @Test func showsTheErrorOfAFailedAction() async throws {
        try storedUser(2, "anna", friend: true)
        friendService.failure = serverError(500, "Server down")
        let model = friendsModel()

        await model.removeFriend(id: 2)

        #expect(model.errorMessage == "Server down")
        #expect(users.user(serverId: 2)?.isFriend == true)
    }

    @Test func opensTheDirectChatWithAFriend() async throws {
        chatService.chat = chatDTO(id: 9, groupChat: false, name: nil)
        try storedChat(serverId: 9)
        var opened: [Int] = []
        let model = friendsModel { opened.append($0.serverId) }

        await model.openDirectChat(with: 2)

        #expect(opened == [9])
        #expect(sync.storedChats.map(\.id) == [9])
    }

    @Test func asksBeforeRemovingOrBlocking() {
        let model = friendsModel()

        model.confirmation = .remove(id: 2, username: "anna")
        #expect(model.confirmationTitle == "Remove anna as a friend?")
        model.confirmation = .block(id: 2, username: "anna", profile: nil)
        #expect(model.confirmationTitle == "Block anna?")
    }

    // MARK: - BlockedUsersViewModel

    @Test func unblocksAUser() async throws {
        let user = try storedUser(5, "mike", blocked: true)
        let model = BlockedUsersViewModel(friendService: friendService, users: users)

        await model.unblock(user)

        #expect(friendService.unblocked == [5])
        #expect(!user.isBlocked)
        #expect(model.busyIds.isEmpty)
    }

    @Test func treatsAUserUnblockedElsewhereAsUnblocked() async throws {
        let user = try storedUser(5, "mike", blocked: true)
        friendService.failure = serverError(404)
        let model = BlockedUsersViewModel(friendService: friendService, users: users)

        await model.unblock(user)

        #expect(!user.isBlocked)
        #expect(model.errorMessage == nil)
    }

    @Test func keepsTheBlockIfTheUnblockFailed() async throws {
        let user = try storedUser(5, "mike", blocked: true)
        friendService.failure = serverError(500, "Server down")
        let model = BlockedUsersViewModel(friendService: friendService, users: users)

        await model.unblock(user)

        #expect(user.isBlocked)
        #expect(model.errorMessage == "Server down")
    }

    // MARK: - PublicGroupsViewModel

    func groupsModel(opened: @escaping (Chat) -> Void = { _ in }) -> PublicGroupsViewModel {
        PublicGroupsViewModel(chatService: chatService, syncService: sync, chats: chats, openChat: opened)
    }

    @Test func listsTheLatestActiveGroupsFirstAndFiltersThem() async {
        chatService.publicGroups = [
            chatDTO(id: 1, name: "Morning Runners", isPublic: true, latestMessageTimestamp: "2026-10-02T08:00:00Z"),
            chatDTO(id: 2, name: "Powerlifting", isPublic: true, latestMessageTimestamp: "2026-10-10T08:00:00Z"),
            chatDTO(id: 3, name: "Yoga", isPublic: true),
        ]
        let model = groupsModel()

        await model.load()

        #expect(model.filteredGroups.map(\.id) == [2, 1, 3])
        model.searchText = " run "
        #expect(model.filteredGroups.map(\.id) == [1])
    }

    @Test func showsWhyTheGroupsCouldntBeLoaded() async {
        chatService.failure = serverError(500, "Server down")
        let model = groupsModel()

        await model.load()

        #expect(model.groups == nil)
        #expect(model.loadError == "Server down")
    }

    @Test func joinsAGroupAndOpensIt() async throws {
        chatService.chat = chatDTO(id: 7, name: "Powerlifting", isPublic: true)
        try storedChat(serverId: 7)
        var opened: [Int] = []
        let model = groupsModel { opened.append($0.serverId) }

        await model.open(chatService.chat, joined: false, blockedUsers: [])

        #expect(chatService.joined == [7])
        #expect(opened == [7])
        #expect(model.joiningId == nil)
    }

    @Test func opensAJoinedGroupWithoutJoiningAgain() async throws {
        let group = chatDTO(id: 7, name: "Powerlifting", isPublic: true)
        try storedChat(serverId: 7)
        var opened: [Int] = []
        let model = groupsModel { opened.append($0.serverId) }

        await model.open(group, joined: true, blockedUsers: [])

        #expect(chatService.joined.isEmpty)
        #expect(opened == [7])
    }

    @Test func warnsBeforeJoiningAGroupWithBlockedMembers() async throws {
        let group = chatDTO(id: 7, name: "Powerlifting", isPublic: true, members: [(5, nil), (6, nil), (8, nil)])
        let blocked = [try storedUser(5, "mike", blocked: true), try storedUser(6, "nina", blocked: true)]
        let model = groupsModel()

        await model.open(group, joined: false, blockedUsers: blocked)

        #expect(chatService.joined.isEmpty)
        #expect(model.pendingJoin?.warning == "mike and nina, who you blocked, are members of this group. In a group you see each other's messages.")
        #expect(PublicGroupsViewModel.blockedMembersWarning(group, blockedUsers: [blocked[0]])?.hasPrefix("mike, who you blocked, is a member") == true)
        #expect(PublicGroupsViewModel.blockedMembersWarning(group, blockedUsers: []) == nil)
    }
}
