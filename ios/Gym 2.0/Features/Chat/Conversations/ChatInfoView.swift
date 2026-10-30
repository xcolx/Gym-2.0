//
//  ChatInfoView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI
import SwiftData
import PhotosUI

/// The members of a chat with the friend actions for them, and the name and image of a group.
/// Only the admins of a group can change its name and image, make it public or private, add and remove members of a
/// private group, make other members admins and delete it. Both members of a direct chat can delete it.
/// All changes need a connection.
struct ChatInfoView: View {

    let chat: Chat
    @Binding var path: NavigationPath

    @Environment(\.modelContext) private var context
    @Environment(\.friendService) private var friendService
    @Environment(\.chatService) private var chatService
    @Environment(SyncService.self) private var syncService

    var body: some View {
        let chats = ChatRepository(context: context)
        ChatInfoContentView(model: ChatInfoViewModel(
            chat: chat,
            chatService: chatService,
            syncService: syncService,
            actions: .make(friendService: friendService, chatService: chatService, syncService: syncService, users: UserRepository(context: context), chats: chats),
            chats: chats,
            close: { path = NavigationPath() },
            open: { path.append(ChatRoute.chat($0)) }
        ))
    }
}

private struct ChatInfoContentView: View {

    @State private var model: ChatInfoViewModel

    @Environment(\.chatService) private var chatService
    @Environment(SyncService.self) private var syncService
    @Environment(AuthService.self) private var authService

    @Query private var users: [User]
    @Query(filter: #Predicate<User> { $0.isCurrentUser }) private var currentUsers: [User]

    // The view model is created once, later ones of the parent's body are discarded
    init(model: ChatInfoViewModel) {
        _model = State(initialValue: model)
    }

    private var chat: Chat { model.chat }

    private var currentUserId: Int? {
        currentUsers.first?.serverId ?? authService.currentUser?.id
    }

    private var membership: ChatMembership {
        ChatMembership(chat: chat, currentUserId: currentUserId)
    }

    var body: some View {
        // Removed by a sync, e.g. after the user was removed from the group
        if chat.modelContext == nil || chat.isDeleted {
            ContentUnavailableView("Chat Not Available", systemImage: "bubble.left.and.exclamationmark.bubble.right", description: Text("You're no longer a member of this chat."))
        } else {
            content
        }
    }

    private var content: some View {
        @Bindable var model = model
        let users = User.byServerId(users)
        let membership = membership
        return Form {
            if chat.groupChat {
                groupSection
            }

            Section {
                if membership.isAdmin && !chat.isPublic {
                    Button("Add Members", systemImage: "person.badge.plus") { model.showsAddMembers = true }
                }
                ForEach(membership.sortedMembers(users: users), id: \.userId) { member in
                    memberRow(member, user: users[member.userId])
                }
            } header: {
                Text(chat.groupChat ? "\(chat.members.count) Members" : "Member")
            } footer: {
                if let message = model.message {
                    Text(message)
                }
            }

            Section {
                if chat.groupChat {
                    Button("Report Group…", role: .destructive) {
                        model.reportTarget = .chat(id: chat.serverId, name: chat.name ?? "Group")
                    }
                    Button(role: .destructive) {
                        model.confirmation = .leave
                    } label: {
                        HStack {
                            Text("Leave Group")
                            if model.isLeaving {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(model.isLeaving || model.isDeleting)
                }
                if !chat.groupChat || membership.isAdmin {
                    Button(role: .destructive) {
                        model.confirmation = .delete
                    } label: {
                        HStack {
                            Text(chat.groupChat ? "Delete Group" : "Delete Chat")
                            if model.isDeleting {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(model.isLeaving || model.isDeleting)
                }
            }
        }
        .sheet(isPresented: $model.showsAddMembers) {
            AddMembersView(model: AddMembersViewModel(chat: chat, chatService: chatService, syncService: syncService))
        }
        .navigationTitle(chat.title(users: users, currentUserId: currentUserId))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { model.onAppear() }
        // Not a .task(id:): resetting the selection would cancel it and with it the upload
        .onChange(of: model.selectedPhoto) {
            guard let item = model.selectedPhoto else { return }
            model.selectedPhoto = nil
            Task { await model.uploadGroupImage(from: item) }
        }
        .alert("Something went wrong", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
        .confirmationDialog(model.confirmationTitle(), isPresented: Binding(get: { model.confirmation != nil }, set: { if !$0 { model.confirmation = nil } }), titleVisibility: .visible, presenting: model.confirmation) { confirmation in
            switch confirmation {
            case .remove(let id, _):
                Button("Remove Friend", role: .destructive) { Task { await model.removeFriend(id: id) } }
            case .removeFromGroup(let id, _):
                Button("Remove from Group", role: .destructive) { Task { await model.removeFromGroup(id) } }
            case .leave:
                Button("Leave Group", role: .destructive) { Task { await model.leave(currentUserId: currentUserId) } }
            case .delete:
                Button(chat.groupChat ? "Delete Group" : "Delete Chat", role: .destructive) { Task { await model.delete() } }
            case .block(let id, let username):
                Button("Block", role: .destructive) { Task { await model.block(id: id) } }
                Button("Block and Report…", role: .destructive) {
                    model.reportTarget = .user(id: id, username: username, blocks: true)
                }
            }
        } message: { confirmation in
            switch confirmation {
            case .remove:
                Text("You can't send each other messages in your direct chat anymore until you're friends again.")
            case .block:
                Text("They can't send you friend requests or direct messages anymore, and your direct chat with them is hidden. You can unblock them in the settings.")
            case .removeFromGroup:
                Text("They can't see the group anymore. An admin can add them again.")
            case .leave:
                let rejoin = chat.isPublic || chat.members.count <= 1
                    ? "You can join it again in the public groups, as long as it has members."
                    : "Only an admin can add you again."
                Text(membership.isOnlyAdmin && chat.members.count > 1
                     ? "\(rejoin) You're its only admin, so a random member becomes admin."
                     : rejoin)
            case .delete:
                Text(chat.groupChat
                     ? "The group and all its messages are deleted for all members."
                     : "The chat and all its messages are deleted for both of you.")
            }
        }
        .reportAlert(for: $model.reportTarget) { id, _ in
            try await model.blockAfterReport(id: id)
        }
    }

    // MARK: - Group

    private var groupSection: some View {
        @Bindable var model = model
        let isAdmin = membership.isAdmin
        return Section {
            HStack(spacing: 16) {
                GroupImagePicker(image: nil, hash: chat.imageUrl, selection: $model.selectedPhoto)
                    .disabled(model.isSavingGroup)
                    .allowsHitTesting(isAdmin)
                if isAdmin {
                    TextField("Group name", text: $model.name)
                        .submitLabel(.done)
                        .onSubmit(saveName)
                } else {
                    Text(chat.name ?? "")
                }
                if model.isSavingGroup {
                    ProgressView()
                } else if model.nameChanged {
                    Button("Save", action: saveName)
                        .disabled(!model.canSaveName)
                }
            }
            if isAdmin && chat.imageUrl != nil {
                Button("Remove Group Image", role: .destructive) {
                    Task { await model.removeGroupImage() }
                }
                .disabled(model.isSavingGroup)
            }
            if isAdmin {
                HStack {
                    Toggle("Public", isOn: Binding(get: { chat.isPublic }, set: { isPublic in Task { await model.setPublic(isPublic) } }))
                        .disabled(model.isChangingPublic)
                    if model.isChangingPublic {
                        ProgressView()
                    }
                }
            }
        } footer: {
            Text(chat.isPublic
                 ? "Public group: everyone can find and join it. Members can't be added or removed."
                 : "Private group: only its members can see it, and its admins can add and remove members.")
        }
    }

    private func saveName() {
        Task { await model.saveName() }
    }

    // MARK: - Members

    @ViewBuilder
    private func memberRow(_ member: ChatMember, user: User?) -> some View {
        let userId = member.userId
        let username = user?.username ?? "Unknown user"
        let membership = membership
        HStack(spacing: 12) {
            ProfileIconView(hash: user?.profileIconUrl ?? "", size: 40, color: user?.schemeColor, imageHash: user?.profileImageUrl)
            VStack(alignment: .leading) {
                Text(userId == currentUserId ? "\(username) (You)" : username)
                if let status = membership.status(of: member, user: user) {
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if model.busyIds.contains(userId) {
                ProgressView()
            } else if (userId != currentUserId && user != nil) || membership.canRemove(userId) || membership.adminChange(for: member) != nil {
                Menu {
                    memberActions(member, user: user, username: username)
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                }
                .accessibilityLabel("Actions for \(username)")
            }
        }
    }

    @ViewBuilder
    private func memberActions(_ member: ChatMember, user: User?, username: String) -> some View {
        let userId = member.userId
        let membership = membership
        if userId != currentUserId, let user, !user.isBlocked {
            if user.isFriend {
                if chat.groupChat {
                    Button("Message", systemImage: "bubble.left") {
                        Task { await model.openDirectChat(with: userId) }
                    }
                }
                Button("Remove Friend", systemImage: "person.badge.minus", role: .destructive) {
                    model.confirmation = .remove(id: userId, username: username)
                }
            } else {
                Button("Add Friend", systemImage: "person.badge.plus") {
                    Task { await model.sendRequest(to: userId) }
                }
            }
            Button("Block", systemImage: "hand.raised", role: .destructive) {
                model.confirmation = .block(id: userId, username: username)
            }
        }
        if userId != currentUserId, user != nil {
            Button("Report…", systemImage: "exclamationmark.bubble", role: .destructive) {
                model.reportTarget = .user(id: userId, username: username)
            }
        }
        if let makesAdmin = membership.adminChange(for: member) {
            Button(makesAdmin ? "Make Admin" : "Remove Admin", systemImage: makesAdmin ? "checkmark.shield" : "xmark.shield") {
                Task { await model.setAdmin(makesAdmin, userId: userId) }
            }
        }
        if membership.canRemove(userId) {
            Button("Remove from Group", systemImage: "person.crop.circle.badge.minus", role: .destructive) {
                model.confirmation = .removeFromGroup(id: userId, username: username)
            }
        }
    }
}

/// Adds friends that aren't members yet to a private group
private struct AddMembersView: View {

    @State private var model: AddMembersViewModel

    @Environment(\.dismiss) private var dismiss

    @Query(filter: #Predicate<User> { $0.isFriend }, sort: \User.username) private var friends: [User]

    init(model: AddMembersViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        let candidates = model.candidates(from: friends)
        NavigationStack {
            List(candidates) { friend in
                Button {
                    model.toggle(friend)
                } label: {
                    HStack(spacing: 12) {
                        ProfileIconView(hash: friend.profileIconUrl, size: 36, color: friend.schemeColor, imageHash: friend.profileImageUrl)
                        Text(friend.username)
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: model.selectedIds.contains(friend.serverId) ? "checkmark.circle.fill" : "circle")
                    }
                }
            }
            .overlay {
                if candidates.isEmpty {
                    ContentUnavailableView("No Friends to Add", systemImage: "person.2", description: Text("All your friends are already in the group."))
                }
            }
            .navigationTitle("Add Members")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.isAdding {
                        ProgressView()
                    } else {
                        Button("Add", action: add)
                            .disabled(model.selectedIds.isEmpty)
                    }
                }
            }
            .alert("Could not add the members", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(model.errorMessage ?? "")
            }
        }
    }

    private func add() {
        Task {
            if await model.add(from: friends) {
                dismiss()
            }
        }
    }
}
