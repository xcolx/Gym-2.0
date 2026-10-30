//
//  ChatInfoViewModelTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 22.10.2026.
//
//  The roles in a chat and the changes of ChatInfoView: leaving, deleting, members, admins and the group's name
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

@MainActor
@Suite struct ChatInfoViewModelTests {

    let store: TestStore
    let chatService = FakeChatService()
    let friendService = FakeFriendService()
    let sync = FakeSyncService()

    init() throws {
        store = try TestStore()
    }

    /// A chat with the members (user ID, admin), the current user is 1
    func chat(groupChat: Bool = true, isPublic: Bool = false, name: String? = "Gym", members: [(Int, Bool?)]) throws -> Chat {
        let chat = Chat(serverId: 4, groupChat: groupChat, name: name, createdAt: isoDate("2026-10-01T08:00:00Z"), isPublic: isPublic)
        store.context.insert(chat)
        chat.members = members.map { userId, admin in
            let member = ChatMember(chat: chat, userId: userId, lastReadMessageId: 0, admin: admin)
            store.context.insert(member)
            return member
        }
        try store.context.save()
        return chat
    }

    final class Navigation {
        var closeCount = 0
        var opened: [Chat] = []
    }

    func model(for chat: Chat, navigation: Navigation = Navigation()) -> ChatInfoViewModel {
        let chats = ChatRepository(context: store.context)
        let actions = FriendActions(friendService: friendService, chatService: chatService, syncService: sync, users: UserRepository(context: store.context), chats: chats)
        return ChatInfoViewModel(chat: chat, chatService: chatService, syncService: sync, actions: actions, chats: chats, close: { navigation.closeCount += 1 }, open: { navigation.opened.append($0) })
    }

    /// Relationships don't keep their order, so the members are found by their user ID
    func member(_ userId: Int, of chat: Chat) -> ChatMember {
        chat.members.first { $0.userId == userId }!
    }

    func storedChats() throws -> [Chat] {
        try store.context.fetchAll(Chat.self)
    }

    // MARK: - Roles

    @Test func anAdminCanChangeTheOtherMembers() throws {
        let chat = try chat(members: [(1, true), (2, false), (3, true)])
        let membership = ChatMembership(chat: chat, currentUserId: 1)
        #expect(membership.isAdmin)
        #expect(!membership.isOnlyAdmin)
        #expect(membership.canRemove(2))
        #expect(!membership.canRemove(1))
        #expect(membership.adminChange(for: member(2, of: chat)) == true)
        #expect(membership.adminChange(for: member(3, of: chat)) == false)
        // another admin is left
        #expect(membership.adminChange(for: member(1, of: chat)) == false)
    }

    @Test func theOnlyAdminCantRemoveTheirOwnAdminStatus() throws {
        let chat = try chat(members: [(1, true), (2, false)])
        let membership = ChatMembership(chat: chat, currentUserId: 1)
        #expect(membership.isOnlyAdmin)
        #expect(membership.adminChange(for: member(1, of: chat)) == nil)
    }

    @Test func membersOfPublicGroupsCantBeRemoved() throws {
        let chat = try chat(isPublic: true, members: [(1, true), (2, false)])
        #expect(!ChatMembership(chat: chat, currentUserId: 1).canRemove(2))
    }

    @Test func aMemberWhoIsNoAdminCanChangeNothing() throws {
        let chat = try chat(members: [(1, false), (2, true)])
        let membership = ChatMembership(chat: chat, currentUserId: 1)
        #expect(!membership.isAdmin)
        #expect(!membership.canRemove(2))
        #expect(membership.adminChange(for: member(2, of: chat)) == nil)
    }

    @Test func listsTheCurrentUserFirstAndTheOthersByUsername() throws {
        let chat = try chat(members: [(3, false), (2, false), (1, true)])
        let users = [
            1: User(serverId: 1, username: "zoe", profileImageUrl: "", profileIconUrl: ""),
            2: User(serverId: 2, username: "Bob", profileImageUrl: "", profileIconUrl: ""),
            3: User(serverId: 3, username: "alice", profileImageUrl: "", profileIconUrl: "")
        ]
        users[3]?.isFriend = true

        let membership = ChatMembership(chat: chat, currentUserId: 1)
        #expect(membership.sortedMembers(users: users).map(\.userId) == [1, 3, 2])
        #expect(membership.status(of: member(1, of: chat), user: users[1]) == "Admin")
        #expect(membership.status(of: member(3, of: chat), user: users[3]) == "Friend")
    }

    @Test func aDirectChatOnlyListsTheOtherMember() throws {
        let chat = try chat(groupChat: false, name: nil, members: [(1, nil), (2, nil)])
        #expect(ChatMembership(chat: chat, currentUserId: 1).sortedMembers(users: [:]).map(\.userId) == [2])
    }

    // MARK: - Leaving and deleting

    @Test func leavingRemovesTheChatAndGoesBack() async throws {
        let chat = try chat(members: [(1, false), (2, true)])
        let navigation = Navigation()
        let model = model(for: chat, navigation: navigation)

        await model.leave(currentUserId: 1)

        #expect(chatService.removedMembers.map(\.userId) == [1])
        #expect(navigation.closeCount == 1)
        #expect(try storedChats().isEmpty)
        #expect(!store.context.hasChanges)
        #expect(!model.isLeaving)
    }

    @Test func aChatThatWasAlreadyDeletedIsRemovedToo() async throws {
        let chat = try chat(groupChat: false, name: nil, members: [(1, nil), (2, nil)])
        chatService.failure = serverError(404, "Chat not found.")
        let navigation = Navigation()
        let model = model(for: chat, navigation: navigation)

        await model.delete()

        #expect(chatService.deletedChats == [4])
        #expect(navigation.closeCount == 1)
        #expect(try storedChats().isEmpty)
        #expect(model.errorMessage == nil)
    }

    @Test func keepsTheChatWhenTheServerCantBeReached() async throws {
        let chat = try chat(members: [(1, true), (2, false)])
        chatService.failure = APIError.transport(URLError(.notConnectedToInternet))
        let navigation = Navigation()
        let model = model(for: chat, navigation: navigation)

        await model.delete()

        #expect(navigation.closeCount == 0)
        #expect(try storedChats().count == 1)
        #expect(model.errorMessage == "Could not reach the server. Please check your internet connection.")
        #expect(!model.isDeleting)
    }

    // MARK: - Members and admins

    @Test func removesAMemberRightAway() async throws {
        let chat = try chat(members: [(1, true), (2, false), (3, false)])
        let model = model(for: chat)

        await model.removeFromGroup(2)

        #expect(chatService.removedMembers.map(\.userId) == [2])
        #expect(chat.members.map(\.userId).sorted() == [1, 3])
        #expect(!store.context.hasChanges)
        #expect(model.busyIds.isEmpty)
    }

    @Test func storesTheChatAfterAnAdminChange() async throws {
        let chat = try chat(members: [(1, true), (2, false)])
        let model = model(for: chat)

        await model.setAdmin(true, userId: 2)

        #expect(chatService.adminChanges.first?.userId == 2)
        #expect(sync.storedChats.count == 1)
        #expect(model.busyIds.isEmpty)
    }

    @Test func blockingTheOtherMemberOfADirectChatGoesBack() async throws {
        let chat = try chat(groupChat: false, name: nil, members: [(1, nil), (2, nil)])
        let other = User(serverId: 2, username: "other", profileImageUrl: "", profileIconUrl: "")
        other.isFriend = true
        store.context.insert(other)
        let navigation = Navigation()
        let model = model(for: chat, navigation: navigation)

        await model.block(id: 2)

        #expect(friendService.blocked == [2])
        #expect(other.isBlocked)
        #expect(!other.isFriend)
        #expect(navigation.closeCount == 1)
    }

    @Test func showsTheMessageOfTheFriendRequest() async throws {
        let chat = try chat(members: [(1, false), (2, false)])
        let model = model(for: chat)

        await model.sendRequest(to: 2)

        #expect(friendService.requestsSentTo == [2])
        #expect(model.message == "Friend request sent to the user.")
    }

    // MARK: - Group name

    @Test func savesTheTrimmedName() async throws {
        let chat = try chat(members: [(1, true)])
        let model = model(for: chat)
        model.onAppear()
        #expect(model.name == "Gym")
        #expect(!model.nameChanged)

        model.name = "  Lifters "
        #expect(model.nameChanged)
        #expect(model.canSaveName)
        await model.saveName()

        #expect(chatService.groupUpdates.first?.name == "Lifters")
        #expect(model.name == "Lifters")
        #expect(!model.isSavingGroup)
    }

    @Test func refusesATooLongName() async throws {
        let chat = try chat(members: [(1, true)])
        let model = model(for: chat)
        model.name = String(repeating: "a", count: NewGroupChatViewModel.maxNameLength + 1)
        #expect(!model.canSaveName)

        await model.saveName()

        #expect(chatService.groupUpdates.isEmpty)
    }

    @Test func putsTheNameBackWhenTheChangeFails() async throws {
        let chat = try chat(members: [(1, true)])
        chatService.failure = serverError(403, "Only admins can rename the group.")
        let model = model(for: chat)
        model.name = "Lifters"

        await model.saveName()

        #expect(model.name == "Gym")
        #expect(model.errorMessage == "Only admins can rename the group.")
    }

    @Test func theConfirmationTitleNamesTheAction() throws {
        let chat = try chat(members: [(1, true)])
        let model = model(for: chat)
        model.confirmation = .leave
        #expect(model.confirmationTitle() == "Leave and delete the group?")
        model.confirmation = .block(id: 2, username: "bob")
        #expect(model.confirmationTitle() == "Block bob?")
        model.confirmation = nil
        #expect(model.confirmationTitle() == "")
    }
}
