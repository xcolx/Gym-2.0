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

    @Environment(UserSettings.self) private var userSettings

    // The view model is created once, later ones of the parent's body are discarded
    init(model: FriendsViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        List {
            searchSection
            requestsSection
            sentSection
            friendsSection
        }
        .navigationTitle("Friends")
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
                Button("Remove friend", role: .destructive) { Task { await model.removeFriend(id: id) } }
            case .block(let id, let username, let profile):
                Button("Block", role: .destructive) { Task { await model.block(id: id, profile: profile) } }
                Button("Block and report…", role: .destructive) {
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

    // MARK: - Search

    /// The exact username, and the user found with it
    private var searchSection: some View {
        @Bindable var model = model
        let canSearch = !model.searchText.trimmingCharacters(in: .whitespaces).isEmpty
        return Section {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Add by username", text: $model.searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit(search)
                if model.isSearching {
                    ProgressView()
                } else if canSearch {
                    Button {
                        model.searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear")
                    Button("Search", action: search)
                        .fontWeight(.semibold)
                        .buttonStyle(.borderless)
                }
            }
            .onChange(of: model.searchText) {
                model.foundUser = nil
                model.searchMessage = nil
            }

            if let foundUser = model.foundUser {
                HStack(spacing: 12) {
                    ProfileIconView(hash: foundUser.profileIconUrl, size: 44, color: foundUser.schemeColor, imageHash: foundUser.profileImageUrl)
                    Text(foundUser.username)
                        .font(.body.weight(.medium))
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    foundUserAction(foundUser)
                }
                .contextMenu {
                    Button("Report…", systemImage: "exclamationmark.bubble") {
                        model.reportTarget = .user(id: foundUser.id, username: foundUser.username)
                    }
                }
            }
            if let searchMessage = model.searchMessage {
                Label(searchMessage, systemImage: "person.fill.questionmark")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } footer: {
            Text("Usernames are case-sensitive.")
        }
    }

    @ViewBuilder
    private func foundUserAction(_ user: UserDTO) -> some View {
        let stored = User.byServerId(users)[user.id]
        if stored?.isCurrentUser ?? false {
            StatusText("That's you")
        } else if stored?.isFriend ?? false {
            StatusText("Friends")
        } else if stored?.isBlocked ?? false {
            StatusText("Blocked")
        } else if model.busyIds.contains(user.id) {
            ProgressView()
        } else if model.sentRequests.contains(where: { $0.receiver.id == user.id }) {
            Menu {
                Button("Cancel request", systemImage: "xmark", role: .destructive) {
                    Task { await model.cancelRequest(to: user.id) }
                }
            } label: {
                Label("Requested", systemImage: "clock")
                    .font(.subheadline.weight(.medium))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .tint(.secondary)
        } else {
            Button {
                Task { await model.sendRequest(to: user.id) }
            } label: {
                Text("Add")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 6)
                    .foregroundStyle(userSettings.appColorForeground)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
        }
    }

    private func search() {
        Task { await model.search() }
    }

    // MARK: - Requests

    /// The requests sent to the user, first since they wait for an answer
    @ViewBuilder
    private var requestsSection: some View {
        if !model.requests.isEmpty || model.requestsError != nil {
            Section {
                if let requestsError = model.requestsError {
                    Label(requestsError, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ForEach(model.requests, id: \.sender.id) { request in
                    VStack(spacing: 12) {
                        PersonRow(user: request.sender, detail: request.timestamp.formatted(.relative(presentation: .named)))
                        if model.busyIds.contains(request.sender.id) {
                            ProgressView()
                                .frame(maxWidth: .infinity, minHeight: 34)
                        } else {
                            HStack(spacing: 10) {
                                Button {
                                    Task { await model.answer(request, accept: true) }
                                } label: {
                                    Text("Accept")
                                        .fontWeight(.semibold)
                                        .foregroundStyle(userSettings.appColorForeground)
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.borderedProminent)
                                Button {
                                    Task { await model.answer(request, accept: false) }
                                } label: {
                                    Text("Decline")
                                        .fontWeight(.medium)
                                        .foregroundStyle(.primary)
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                .tint(.secondary)
                            }
                            .buttonBorderShape(.roundedRectangle(radius: 10))
                        }
                    }
                    .padding(.vertical, 4)
                    .contextMenu {
                        Button("Report…", systemImage: "exclamationmark.bubble") {
                            model.reportTarget = .user(id: request.sender.id, username: request.sender.username)
                        }
                        Button("Block", systemImage: "hand.raised", role: .destructive) {
                            model.confirmation = .block(id: request.sender.id, username: request.sender.username, profile: request.sender)
                        }
                    }
                }
            } header: {
                // without a count if only the error is shown
                Text(model.requests.isEmpty ? "Friend requests" : model.requests.count == 1 ? "1 friend request" : "\(model.requests.count) friend requests")
            }
        }
    }

    /// The requests the user sent that weren't answered yet
    @ViewBuilder
    private var sentSection: some View {
        if !model.sentRequests.isEmpty {
            Section("Sent") {
                ForEach(model.sentRequests, id: \.receiver.id) { request in
                    HStack(spacing: 12) {
                        PersonRow(user: request.receiver, detail: "Waiting · sent \(request.timestamp.formatted(.relative(presentation: .named)))")
                        if model.busyIds.contains(request.receiver.id) {
                            ProgressView()
                        } else {
                            Button("Cancel") { Task { await model.cancelRequest(to: request.receiver.id) } }
                                .font(.subheadline.weight(.medium))
                                .buttonStyle(.bordered)
                                .buttonBorderShape(.capsule)
                                .tint(.secondary)
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
                VStack(spacing: 8) {
                    Image(systemName: "person.2")
                        .font(.largeTitle)
                        .foregroundStyle(userSettings.appColor)
                    Text("No friends yet")
                        .font(.headline)
                    Text("Search for a username to add someone.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            }
            ForEach(friends) { friend in
                Button {
                    openChat(with: friend.serverId)
                } label: {
                    HStack(spacing: 12) {
                        ProfileIconView(hash: friend.profileIconUrl, size: 44, color: friend.schemeColor, imageHash: friend.profileImageUrl)
                        Text(friend.username)
                            .font(.body.weight(.medium))
                            // not tinted like the button
                            .foregroundStyle(Color.primary)
                            .lineLimit(1)
                        Spacer()
                        if model.busyIds.contains(friend.serverId) {
                            ProgressView()
                        } else {
                            Image(systemName: "bubble.left.fill")
                                .font(.subheadline)
                                .foregroundStyle(userSettings.appColor)
                                .frame(width: 34, height: 34)
                                .background(userSettings.appColor.opacity(0.15), in: Circle())
                                .accessibilityLabel("Message")
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
                    Button("Remove friend", systemImage: "person.badge.minus", role: .destructive) {
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
            if !friends.isEmpty {
                Text(friends.count == 1 ? "1 friend" : "\(friends.count) friends")
            }
        }
    }

    private func openChat(with friendId: Int) {
        Task { await model.openDirectChat(with: friendId) }
    }
}

/// The picture and the username of a user from the server, with a line below
private struct PersonRow: View {

    let user: UserDTO
    let detail: String

    var body: some View {
        HStack(spacing: 12) {
            ProfileIconView(hash: user.profileIconUrl, size: 44, color: user.schemeColor, imageHash: user.profileImageUrl)
            VStack(alignment: .leading, spacing: 1) {
                Text(user.username)
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}

/// Why a found user can't be added, in place of the button
private struct StatusText: View {

    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(.secondary)
    }
}
