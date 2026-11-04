//
//  ChatsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 12.02.2025.
//

import SwiftUI
import SwiftData

/// The screens of the chat tab besides the Gym-AI. Register them with `chatNavigationDestinations(path:)`.
enum ChatRoute: Hashable {
    case chat(Chat)
    case info(Chat)
    case friends
    case publicGroups
}

extension View {
    func chatNavigationDestinations(path: Binding<NavigationPath>) -> some View {
        navigationDestination(for: ChatRoute.self) { route in
            switch route {
            case .chat(let chat):
                ChatView(chat: chat)
            case .info(let chat):
                ChatInfoView(chat: chat, path: path)
            case .friends:
                FriendsView(path: path)
            case .publicGroups:
                PublicGroupsView(path: path)
            }
        }
    }
}

/// The chat tab: the Gym-AI card, the pending friend requests and the direct and group chats of the user, newest
/// first, which can be searched by name.
struct ChatsView: View {

    @Environment(SyncService.self) private var syncService
    @Environment(AuthService.self) private var authService
    @Environment(\.friendService) private var friendService
    @Environment(UserSettings.self) private var userSettings

    @Query private var chats: [Chat]
    @Query private var users: [User]
    @Query(filter: #Predicate<User> { $0.isCurrentUser }) private var currentUsers: [User]

    @State private var path = NavigationPath()
    @State private var showsNewGroup = false
    @State private var friendRequestCount = 0
    @State private var friendRequestsLoaded: Date?
    @State private var searchText = ""

    /// No push updates yet, so the list polls while it's shown
    private static let pollInterval: Duration = .seconds(3)
    /// GET /users/friend-requests is limited to 30 requests per minute
    private static let friendRequestsInterval: TimeInterval = 30

    private var currentUserId: Int? {
        currentUsers.first?.serverId ?? authService.currentUser?.id
    }

    private var visibleChats: [Chat] {
        let users = User.byServerId(users)
        return chats
            .filter { !$0.isHidden(users: users, currentUserId: currentUserId) }
            .sorted { $0.lastActivity > $1.lastActivity }
    }

    /// The visible chats that match the search, best match first
    private func shownChats(users: [Int: User]) -> [Chat] {
        guard !searchText.isEmpty else { return visibleChats }
        return FuzzySearch.filter(visibleChats, query: searchText) { [$0.title(users: users, currentUserId: currentUserId)] }
    }

    var body: some View {
        let users = User.byServerId(users)
        let shownChats = shownChats(users: users)
        NavigationStack(path: $path) {
            List {
                if searchText.isEmpty {
                    Section {
                        AIConversationsBannerView()
                        if friendRequestCount > 0 {
                            friendRequestsRow
                        }
                    }
                }

                Section {
                    ForEach(shownChats) { chat in
                        NavigationLink(value: ChatRoute.chat(chat)) {
                            ChatRowView(chat: chat, users: users, currentUserId: currentUserId)
                        }
                    }
                }
            }
            .overlay {
                if visibleChats.isEmpty {
                    ContentUnavailableView {
                        Label("No chats yet", systemImage: "bubble.left.and.bubble.right")
                    } description: {
                        Text("Add friends to chat with them, or join a public group.")
                    } actions: {
                        Button("Friends") { path.append(ChatRoute.friends) }
                        Button("Public groups") { path.append(ChatRoute.publicGroups) }
                    }
                    // below the Gym-AI card
                    .padding(.top, 120)
                } else if shownChats.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                }
            }
            .searchable(text: $searchText, prompt: "Search chats")
            .refreshable { await syncService.sync() }
            .navigationTitle("Chats")
            .toolbar { toolbar }
            .aiNavigationDestinations()
            .chatNavigationDestinations(path: $path)
            // Only while the list itself is shown, an open chat polls on its own
            .task(id: path.isEmpty) {
                guard path.isEmpty else { return }
                // e.g. back from the friends, where requests may have been answered
                friendRequestsLoaded = nil
                while !Task.isCancelled {
                    await syncService.syncChats()
                    if friendRequestsLoaded.map({ Date.now.timeIntervalSince($0) >= Self.friendRequestsInterval }) ?? true {
                        await loadFriendRequestCount()
                    }
                    try? await Task.sleep(for: Self.pollInterval)
                }
            }
        }
        .sheet(isPresented: $showsNewGroup) {
            NewGroupChatView { chat in
                path.append(ChatRoute.chat(chat))
            }
        }
    }

    /// Only while friend requests are pending
    private var friendRequestsRow: some View {
        NavigationLink(value: ChatRoute.friends) {
            HStack(spacing: 12) {
                Image(systemName: "person.badge.plus")
                    .font(.title3)
                    .foregroundStyle(userSettings.appColor)
                    .frame(width: 44, height: 44)
                    .background(userSettings.appColor.opacity(0.15), in: Circle())
                Text(friendRequestCount == 1 ? "1 friend request" : "\(friendRequestCount) friend requests")
                    .font(.body.weight(.medium))
                Spacer()
                Text("\(friendRequestCount)")
                    .font(.caption.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(.red, in: Capsule())
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                path.append(ChatRoute.friends)
            } label: {
                Image(systemName: "person.2.fill")
                    .overlay(alignment: .topTrailing) {
                        if friendRequestCount > 0 {
                            Circle()
                                .fill(.red)
                                .frame(width: 9, height: 9)
                                .offset(x: 4, y: -3)
                        }
                    }
            }
            .accessibilityLabel(friendRequestCount > 0 ? "Friends, \(friendRequestCount) requests" : "Friends")
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("New group", systemImage: "person.3") { showsNewGroup = true }
                Button("Public groups", systemImage: "globe") { path.append(ChatRoute.publicGroups) }
                Button("Friends", systemImage: "person.2") { path.append(ChatRoute.friends) }
            } label: {
                Image(systemName: "square.and.pencil")
            }
            .accessibilityLabel("New chat")
        }
    }

    private func loadFriendRequestCount() async {
        guard let friendService, let requests = try? await friendService.friendRequests() else { return }
        friendRequestCount = requests.count
        friendRequestsLoaded = .now
    }
}

/// A chat in the list: image, name, preview of the latest message and the unread count
struct ChatRowView: View {

    let chat: Chat
    let users: [Int: User]
    let currentUserId: Int?

    @Environment(UserSettings.self) private var userSettings

    private var preview: String? {
        guard let text = chat.latestMessagePreview else { return nil }
        guard chat.groupChat || chat.latestMessageSenderId == currentUserId, let senderId = chat.latestMessageSenderId else {
            return text
        }
        let sender = senderId == currentUserId ? "You" : users[senderId]?.username ?? "Unknown"
        return "\(sender): \(text)"
    }

    var body: some View {
        let unread = chat.unreadCount(currentUserId: currentUserId)
        HStack(spacing: 12) {
            ChatImageView(chat: chat, users: users, currentUserId: currentUserId, size: 52)

            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(chat.title(users: users, currentUserId: currentUserId))
                        .font(.body.weight(unread > 0 ? .bold : .semibold))
                        .lineLimit(1)
                    Spacer()
                    Text(chat.lastActivity, format: chat.lastActivity.isToday ? .dateTime.hour().minute() : .dateTime.day().month())
                        .font(.caption.weight(unread > 0 ? .semibold : .regular))
                        .foregroundStyle(unread > 0 ? userSettings.appColor : .secondary)
                }
                HStack(alignment: .top) {
                    Text(preview ?? "No messages yet")
                        .font(.subheadline.weight(unread > 0 ? .medium : .regular))
                        .foregroundStyle(unread > 0 ? .primary : .secondary)
                        .lineLimit(2, reservesSpace: false)
                    Spacer()
                    if unread > 0 {
                        Text("\(unread)")
                            .font(.caption.bold())
                            .foregroundStyle(userSettings.appColorForeground)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(userSettings.appColor, in: Capsule())
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }
}

/// The group image (or the initials of the group), or the profile icon of the other member of a direct chat
struct ChatImageView: View {

    let chat: Chat
    let users: [Int: User]
    let currentUserId: Int?
    let size: CGFloat
    var opensPhotoViewer = true

    @Environment(UserSettings.self) private var userSettings

    /// The first letters of the first two words of the group name, e.g. "LD" for "Leg day crew"
    static func initials(of name: String?) -> String? {
        let letters = (name ?? "")
            .split(whereSeparator: { $0.isWhitespace })
            .prefix(2)
            .compactMap { $0.first(where: { $0.isLetter || $0.isNumber }) }
        return letters.isEmpty ? nil : String(letters).uppercased()
    }

    var body: some View {
        if chat.groupChat {
            ServerImageView(hash: chat.imageUrl, contentMode: .fill) {
                Group {
                    if let initials = Self.initials(of: chat.name) {
                        Text(initials)
                            .font(.system(size: size * 0.38, weight: .semibold, design: .rounded))
                    } else {
                        Image(systemName: "person.3.fill")
                            .resizable()
                            .scaledToFit()
                            .padding(size * 0.22)
                    }
                }
                .foregroundStyle(userSettings.appColor)
                // the whole circle, not only the wide icon
                .frame(width: size, height: size)
                .background(userSettings.appColor.opacity(0.18))
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .opensPhotoViewer(hash: opensPhotoViewer ? chat.imageUrl : nil)
        } else {
            let other = chat.otherMemberId(currentUserId: currentUserId).flatMap { users[$0] }
            ProfileIconView(hash: other?.profileIconUrl ?? "", size: size, color: other?.schemeColor, imageHash: opensPhotoViewer ? other?.profileImageUrl : nil)
        }
    }
}

extension Date {
    var isToday: Bool {
        Calendar.current.isDateInToday(self)
    }
}
