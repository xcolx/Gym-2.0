//
//  FriendsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 09.05.2025.
//

import SwiftUI
import SwiftData

/// Finding users by their username, the sent and received friend requests and the friends, from which a direct chat is started.
struct FriendsView: View {

    @Binding var path: NavigationPath

    @Environment(\.modelContext) private var context
    @Environment(\.friendService) private var friendService
    @Environment(\.chatService) private var chatService
    @Environment(\.userService) private var userService
    @Environment(SyncService.self) private var syncService

    var body: some View {
        FriendsContentView(model: FriendsViewModel(
            friendService: friendService,
            userService: userService,
            syncService: syncService,
            actions: .make(friendService: friendService, chatService: chatService, syncService: syncService, users: UserRepository(context: context), chats: ChatRepository(context: context)),
            openChat: { path.append(ChatRoute.chat($0)) }
        ))
    }
}

private struct FriendsContentView: View {

    @State private var model: FriendsViewModel

    @Query(filter: #Predicate<User> { $0.isFriend }, sort: \User.username) private var friends: [User]
    @Query private var users: [User]

    // The view model is created once, later ones of the parent's body are discarded
    init(model: FriendsViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        List {
            addFriendSection
            requestsSection
            friendsSection
        }
        .navigationTitle("Friends")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await model.refresh()
        }
        .task { await model.loadRequests() }
        .alert("Something went wrong", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
        .confirmationDialog(model.confirmationTitle, isPresented: Binding(get: { model.confirmation != nil }, set: { if !$0 { model.confirmation = nil } }), titleVisibility: .visible, presenting: model.confirmation) { confirmation in
            switch confirmation {
            case .remove(let id, _):
                Button("Remove Friend", role: .destructive) { Task { await model.removeFriend(id: id) } }
            case .block(let id, let username, let profile):
                Button("Block", role: .destructive) { Task { await model.block(id: id, profile: profile) } }
                Button("Block and Report…", role: .destructive) {
                    model.reportTarget = .user(id: id, username: username, profile: profile, blocks: true)
                }
            }
        } message: { confirmation in
            switch confirmation {
            case .remove:
                Text("You can't send each other messages in your direct chat anymore until you're friends again.")
            case .block:
                Text("They can't send you friend requests or messages anymore, and your chat with them is hidden. You can unblock them in the settings.")
            }
        }
        .reportAlert(for: Bindable(model).reportTarget) { id, profile in
            try await model.blockAfterReport(id: id, profile: profile)
        }
    }

    // MARK: - Add friend

    private var addFriendSection: some View {
        @Bindable var model = model
        return Section {
            HStack {
                TextField("Exact username", text: $model.searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit(search)
                if model.isSearching {
                    ProgressView()
                } else {
                    Button("Search", action: search)
                        .disabled(model.searchText.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: model.searchText) {
                model.foundUser = nil
                model.searchMessage = nil
            }

            if let foundUser = model.foundUser {
                HStack(spacing: 12) {
                    ProfileIconView(hash: foundUser.profileIconUrl, size: 40, color: foundUser.schemeColor, imageHash: foundUser.profileImageUrl)
                    Text(foundUser.username)
                    Spacer()
                    foundUserAction(foundUser)
                }
                .contextMenu {
                    Button("Report…", systemImage: "exclamationmark.bubble") {
                        model.reportTarget = .user(id: foundUser.id, username: foundUser.username)
                    }
                }
            }
            if let searchMessage = model.searchMessage {
                Text(searchMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            ForEach(model.sentRequests, id: \.receiver.id) { request in
                HStack(spacing: 12) {
                    ProfileIconView(hash: request.receiver.profileIconUrl, size: 40, color: request.receiver.schemeColor, imageHash: request.receiver.profileImageUrl)
                    VStack(alignment: .leading) {
                        Text(request.receiver.username)
                        Text("Sent \(request.timestamp, format: .relative(presentation: .named))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if model.busyIds.contains(request.receiver.id) {
                        ProgressView()
                    } else {
                        Button("Cancel") { Task { await model.cancelRequest(to: request.receiver.id) } }
                            .buttonStyle(.bordered)
                    }
                }
            }
        } header: {
            Text("Add Friend")
        } footer: {
            Text("Usernames are case-sensitive.")
        }
    }

    @ViewBuilder
    private func foundUserAction(_ user: UserDTO) -> some View {
        let stored = User.byServerId(users)[user.id]
        if stored?.isCurrentUser ?? false {
            Text("That's you").foregroundStyle(.secondary)
        } else if stored?.isFriend ?? false {
            Text("Friends").foregroundStyle(.secondary)
        } else if stored?.isBlocked ?? false {
            Text("Blocked").foregroundStyle(.secondary)
        } else if model.busyIds.contains(user.id) {
            ProgressView()
        } else if model.sentRequests.contains(where: { $0.receiver.id == user.id }) {
            Button("Cancel Request") { Task { await model.cancelRequest(to: user.id) } }
                .buttonStyle(.bordered)
        } else {
            Button("Add") {
                Task { await model.sendRequest(to: user.id) }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private func search() {
        Task { await model.search() }
    }

    // MARK: - Requests

    @ViewBuilder
    private var requestsSection: some View {
        if !model.requests.isEmpty || model.requestsError != nil {
            Section("Friend Requests") {
                if let requestsError = model.requestsError {
                    Text(requestsError)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ForEach(model.requests, id: \.sender.id) { request in
                    HStack(spacing: 12) {
                        ProfileIconView(hash: request.sender.profileIconUrl, size: 40, color: request.sender.schemeColor, imageHash: request.sender.profileImageUrl)
                        VStack(alignment: .leading) {
                            Text(request.sender.username)
                            Text(request.timestamp, format: .relative(presentation: .named))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if model.busyIds.contains(request.sender.id) {
                            ProgressView()
                        } else {
                            Button("Accept") { Task { await model.answer(request, accept: true) } }
                                .buttonStyle(.borderedProminent)
                            Button("Decline") { Task { await model.answer(request, accept: false) } }
                                .buttonStyle(.bordered)
                        }
                    }
                    .contextMenu {
                        Button("Report…", systemImage: "exclamationmark.bubble") {
                            model.reportTarget = .user(id: request.sender.id, username: request.sender.username)
                        }
                        Button("Block", systemImage: "hand.raised", role: .destructive) {
                            model.confirmation = .block(id: request.sender.id, username: request.sender.username, profile: request.sender)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Friends

    private var friendsSection: some View {
        Section {
            if friends.isEmpty {
                Text("No friends yet. Search for their username above.")
                    .foregroundStyle(.secondary)
            }
            ForEach(friends) { friend in
                Button {
                    openChat(with: friend.serverId)
                } label: {
                    HStack(spacing: 12) {
                        ProfileIconView(hash: friend.profileIconUrl, size: 40, color: friend.schemeColor, imageHash: friend.profileImageUrl)
                        Text(friend.username)
                            .foregroundStyle(.primary)
                        Spacer()
                        if model.busyIds.contains(friend.serverId) {
                            ProgressView()
                        } else {
                            Image(systemName: "bubble.left")
                        }
                    }
                }
                .swipeActions {
                    Button("Block", systemImage: "hand.raised") {
                        model.confirmation = .block(id: friend.serverId, username: friend.username, profile: nil)
                    }
                    .tint(.red)
                    Button("Remove", systemImage: "person.badge.minus") {
                        model.confirmation = .remove(id: friend.serverId, username: friend.username)
                    }
                    .tint(.orange)
                }
                .contextMenu {
                    Button("Message", systemImage: "bubble.left") { openChat(with: friend.serverId) }
                    Button("Remove Friend", systemImage: "person.badge.minus", role: .destructive) {
                        model.confirmation = .remove(id: friend.serverId, username: friend.username)
                    }
                    Button("Report…", systemImage: "exclamationmark.bubble") {
                        model.reportTarget = .user(id: friend.serverId, username: friend.username)
                    }
                    Button("Block", systemImage: "hand.raised", role: .destructive) {
                        model.confirmation = .block(id: friend.serverId, username: friend.username, profile: nil)
                    }
                }
            }
        } header: {
            Text("Friends")
        }
    }

    private func openChat(with friendId: Int) {
        Task { await model.openDirectChat(with: friendId) }
    }
}
