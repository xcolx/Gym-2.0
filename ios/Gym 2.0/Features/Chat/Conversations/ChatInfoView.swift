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
    @Environment(UserSettings.self) private var userSettings

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
            ContentUnavailableView("Chat not available", systemImage: "bubble.left.and.exclamationmark.bubble.right", description: Text("You're no longer a member of this chat."))
        } else {
            content
        }
    }

    private var content: some View {
        @Bindable var model = model
        let users = User.byServerId(users)
        let membership = membership
        return Form {
            Section {
                header(users: users)
            }
            .listRowBackground(Color.clear)

            if chat.groupChat {
                if membership.isAdmin {
                    groupSection
                }

                Section {
                    if membership.isAdmin && !chat.isPublic {
                        Button {
                            model.showsAddMembers = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "person.badge.plus")
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(userSettings.appColor)
                                    .frame(width: 40, height: 40)
                                    .background(userSettings.appColor.opacity(0.15), in: Circle())
                                Text("Add members")
                                    .foregroundStyle(userSettings.appColor)
                            }
                        }
                    }
                    ForEach(membership.sortedMembers(users: users), id: \.userId) { member in
                        memberRow(member, user: users[member.userId])
                    }
                } header: {
                    Text(chat.members.count == 1 ? "1 member" : "\(chat.members.count) members")
                } footer: {
                    if let message = model.message {
                        Text(message)
                    }
                }
            } else if let otherId = chat.otherMemberId(currentUserId: currentUserId), let other = users[otherId] {
                Section {
                    directActions(for: other)
                } footer: {
                    if let message = model.message {
                        Text(message)
                            .frame(maxWidth: .infinity)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            Section {
                if chat.groupChat {
                    Button("Report group…", systemImage: "exclamationmark.bubble", role: .destructive) {
                        model.reportTarget = .chat(id: chat.serverId, name: chat.name ?? "Group")
                    }
                    Button(role: .destructive) {
                        model.confirmation = .leave
                    } label: {
                        HStack {
                            Label("Leave group", systemImage: "rectangle.portrait.and.arrow.right")
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
                            Label(chat.groupChat ? "Delete group" : "Delete chat", systemImage: "trash")
                            if model.isDeleting {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(model.isLeaving || model.isDeleting)
                }
            }
            .foregroundStyle(.red)
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
                Button("Remove friend", role: .destructive) { Task { await model.removeFriend(id: id) } }
            case .removeFromGroup(let id, _):
                Button("Remove from group", role: .destructive) { Task { await model.removeFromGroup(id) } }
            case .leave:
                Button("Leave group", role: .destructive) { Task { await model.leave(currentUserId: currentUserId) } }
            case .delete:
                Button(chat.groupChat ? "Delete group" : "Delete chat", role: .destructive) { Task { await model.delete() } }
            case .block(let id, let username):
                Button("Block", role: .destructive) { Task { await model.block(id: id) } }
                Button("Block and report…", role: .destructive) {
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

    // MARK: - Header

    /// The large image with the name, and what kind of chat it is below
    private func header(users: [Int: User]) -> some View {
        @Bindable var model = model
        let title = chat.title(users: users, currentUserId: currentUserId)
        let subtitle: String? = if chat.groupChat {
            "\(chat.isPublic ? "Public group" : "Private group") · \(chat.members.count == 1 ? "1 member" : "\(chat.members.count) members")"
        } else {
            membership.relation(to: chat.otherMemberId(currentUserId: currentUserId).flatMap { users[$0] })
        }
        return VStack(spacing: 10) {
            if chat.groupChat && membership.isAdmin {
                PhotosPicker(selection: $model.selectedPhoto, matching: .images, photoLibrary: .shared()) {
                    ChatImageView(chat: chat, users: users, currentUserId: currentUserId, size: 96, opensPhotoViewer: false)
                        .overlay {
                            if model.isSavingGroup {
                                Circle()
                                    .fill(.black.opacity(0.35))
                                ProgressView()
                                    .tint(.white)
                            }
                        }
                        .overlay(alignment: .bottomTrailing) {
                            Image(systemName: "camera.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(userSettings.appColorForeground)
                                .frame(width: 30, height: 30)
                                .background(userSettings.appColor, in: Circle())
                                .overlay { Circle().strokeBorder(Color(.systemGroupedBackground), lineWidth: 3) }
                        }
                }
                .buttonStyle(.plain)
                .disabled(model.isSavingGroup)
                .accessibilityLabel("Change group image")
            } else {
                ChatImageView(chat: chat, users: users, currentUserId: currentUserId, size: 96)
            }
            VStack(spacing: 2) {
                Text(title)
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }

    // MARK: - Direct chat

    /// The friend actions for the other member of a direct chat, as buttons below the header
    @ViewBuilder
    private func directActions(for user: User) -> some View {
        let userId = user.serverId
        let isBusy = model.busyIds.contains(userId)
        HStack(spacing: 10) {
            if !user.isBlocked {
                if user.isFriend {
                    ActionTile(title: "Remove friend", systemImage: "person.badge.minus", isDestructive: true) {
                        model.confirmation = .remove(id: userId, username: user.username)
                    }
                } else {
                    ActionTile(title: "Add friend", systemImage: "person.badge.plus") {
                        Task { await model.sendRequest(to: userId) }
                    }
                }
                ActionTile(title: "Block", systemImage: "hand.raised", isDestructive: true) {
                    model.confirmation = .block(id: userId, username: user.username)
                }
            }
            ActionTile(title: "Report", systemImage: "exclamationmark.bubble", isDestructive: true) {
                model.reportTarget = .user(id: userId, username: user.username)
            }
        }
        .disabled(isBusy)
        .opacity(isBusy ? 0.5 : 1)
        .overlay {
            if isBusy {
                ProgressView()
            }
        }
    }

    // MARK: - Group

    /// The name, the image and the visibility of the group, only for its admins
    private var groupSection: some View {
        @Bindable var model = model
        return Section {
            HStack {
                TextField("Group name", text: $model.name)
                    .submitLabel(.done)
                    .onSubmit(saveName)
                if model.isSavingGroup {
                    ProgressView()
                } else if model.nameChanged {
                    Button("Save", action: saveName)
                        .fontWeight(.semibold)
                        .disabled(!model.canSaveName)
                }
            }
            HStack {
                Toggle(isOn: Binding(get: { chat.isPublic }, set: { isPublic in Task { await model.setPublic(isPublic) } })) {
                    SettingsLabel("Public", systemImage: "globe")
                }
                .disabled(model.isChangingPublic)
                if model.isChangingPublic {
                    ProgressView()
                }
            }
            if chat.imageUrl != nil {
                Button("Remove group image", systemImage: "photo.badge.minus", role: .destructive) {
                    Task { await model.removeGroupImage() }
                }
                .foregroundStyle(.red)
                .disabled(model.isSavingGroup)
            }
        } header: {
            Text("Group")
        } footer: {
            Text(chat.isPublic
                 ? "Everyone can find and join the group. Members can't be added or removed."
                 : "Only its members can see the group, and its admins can add and remove members.")
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
        let details = [userId == currentUserId ? "You" : nil, membership.relation(to: user)].compactMap { $0 }
        HStack(spacing: 12) {
            ProfileIconView(hash: user?.profileIconUrl ?? "", size: 40, color: user?.schemeColor, imageHash: user?.profileImageUrl)
            VStack(alignment: .leading, spacing: 1) {
                Text(username)
                    .lineLimit(1)
                if !details.isEmpty {
                    Text(details.joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            if membership.isAdmin(member) {
                Text("Admin")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(userSettings.appColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(userSettings.appColor.opacity(0.15), in: Capsule())
            }
            if model.busyIds.contains(userId) {
                ProgressView()
                    .frame(width: 28)
            } else if (userId != currentUserId && user != nil) || membership.canRemove(userId) || membership.adminChange(for: member) != nil {
                Menu {
                    memberActions(member, user: user, username: username)
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                        .frame(width: 28)
                }
                .accessibilityLabel("Actions for \(username)")
            }
        }
        .accessibilityElement(children: .combine)
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
                Button("Remove friend", systemImage: "person.badge.minus", role: .destructive) {
                    model.confirmation = .remove(id: userId, username: username)
                }
            } else {
                Button("Add friend", systemImage: "person.badge.plus") {
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
            Button(makesAdmin ? "Make admin" : "Remove admin", systemImage: makesAdmin ? "checkmark.shield" : "xmark.shield") {
                Task { await model.setAdmin(makesAdmin, userId: userId) }
            }
        }
        if membership.canRemove(userId) {
            Button("Remove from group", systemImage: "person.crop.circle.badge.minus", role: .destructive) {
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
                    ContentUnavailableView("No friends to add", systemImage: "person.2", description: Text("All your friends are already in the group."))
                }
            }
            .navigationTitle("Add members")
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

/// A button with its icon above its title, for the actions of a direct chat
private struct ActionTile: View {

    let title: String
    let systemImage: String
    var isDestructive = false
    let action: () -> Void

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.title3)
                    .frame(height: 24)
                Text(title)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(isDestructive ? Color.red : userSettings.appColor)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
