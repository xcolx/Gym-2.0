//
//  ChatView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.05.2025.
//

import SwiftUI
import SwiftData
import PhotosUI

/// A direct or group chat. Text is kept in `Chat.input` until the server accepted it, so it's sent again by the next
/// sync if the server couldn't be reached. Photos are only sent while online.
struct ChatView: View {

    let chat: Chat

    @Environment(SyncService.self) private var syncService
    @Environment(\.chatService) private var chatService
    @Environment(\.modelContext) private var context

    var body: some View {
        ChatContentView(model: ChatViewModel(chat: chat, chatService: chatService, syncService: syncService, chats: ChatRepository(context: context)))
    }
}

private struct ChatContentView: View {

    @State private var model: ChatViewModel

    @Environment(AuthService.self) private var authService
    @Environment(UserSettings.self) private var userSettings

    @Query private var users: [User]
    @Query(filter: #Predicate<User> { $0.isCurrentUser }) private var currentUsers: [User]

    private let bottomID = "bottom"

    // The view model is created once, later ones of the parent's body are discarded
    init(model: ChatViewModel) {
        _model = State(initialValue: model)
    }

    private var chat: Chat { model.chat }

    private var currentUserId: Int? {
        currentUsers.first?.serverId ?? authService.currentUser?.id
    }

    /// Admins of a group can also delete the messages of others, and delete and report them
    private var isAdmin: Bool {
        ChatMembership(chat: chat, currentUserId: currentUserId).isAdmin
    }

    private var usersById: [Int: User] {
        User.byServerId(users)
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
        let messages = chat.sortedMessages
        let users = usersById
        let blockedReason = chat.sendingBlockedReason(users: users, currentUserId: currentUserId)
        let isAdmin = isAdmin

        return VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(messages.enumerated()), id: \.element.serverId) { index, message in
                            let previous = index > 0 ? messages[index - 1] : nil
                            let next = index < messages.count - 1 ? messages[index + 1] : nil
                            let startsRun = previous.map { !Self.continues($0, with: message) } ?? true
                            let endsRun = next.map { !Self.continues(message, with: $0) } ?? !model.isPending
                            if previous.map({ !Calendar.current.isDate($0.createdAt, inSameDayAs: message.createdAt) }) ?? true {
                                DaySeparator(date: message.createdAt)
                            }
                            MessageBubbleView(
                                message: message,
                                isOwn: message.senderId == currentUserId,
                                // the sender's name above the first of their messages in a row in groups
                                senderName: chat.groupChat && message.senderId != currentUserId && startsRun
                                    ? message.senderId.flatMap { users[$0]?.username } ?? "Unknown user"
                                    : nil,
                                startsRun: startsRun,
                                endsRun: endsRun,
                                onTapPhoto: { model.viewedPhoto = ViewedPhoto(hash: $0) },
                                onDelete: message.senderId == currentUserId || isAdmin ? { Task { await model.delete(message) } } : nil,
                                onReport: message.senderId == currentUserId ? nil : {
                                    model.reportTarget = .message(id: message.serverId, senderName: message.senderId.flatMap { users[$0]?.username })
                                },
                                onDeleteAndReport: message.senderId == currentUserId || !isAdmin ? nil : {
                                    model.reportTarget = .message(id: message.serverId, senderName: message.senderId.flatMap { users[$0]?.username }, deletes: true)
                                }
                            )
                            .padding(.top, startsRun ? 10 : 2)
                        }

                        if model.isPending {
                            pendingMessage
                                .padding(.top, 10)
                        }

                        Color.clear
                            .frame(height: 1)
                            .id(bottomID)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .defaultScrollAnchor(.bottom)
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: messages.last?.serverId) {
                    withAnimation { proxy.scrollTo(bottomID, anchor: .bottom) }
                    Task { await model.markRead() }
                }
                .onChange(of: model.isPending) {
                    withAnimation { proxy.scrollTo(bottomID, anchor: .bottom) }
                }
            }
            .overlay {
                if messages.isEmpty && !model.isPending {
                    ContentUnavailableView("No messages yet", systemImage: "bubble.left.and.bubble.right", description: Text("Say hi!"))
                }
            }

            if let blockedReason {
                Label(blockedReason, systemImage: "hand.raised.fill")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.bar)
            } else {
                inputBar
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(chat.title(users: users, currentUserId: currentUserId))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                titleButton(users: users)
            }
        }
        .onAppear {
            model.onAppear()
        }
        .onDisappear {
            model.onDisappear()
        }
        .task {
            await model.poll()
        }
        // Right away and then regularly, so that e.g. a changed profile image doesn't wait for the next sync
        .task {
            await model.refreshMembers()
        }
        // Not a .task(id:): resetting the selection would cancel it
        .onChange(of: model.selectedPhoto) {
            guard let item = model.selectedPhoto else { return }
            model.selectedPhoto = nil
            Task { await model.loadPhoto(item) }
        }
        .fullScreenCover(item: $model.viewedPhoto) { photo in
            PhotoViewer(hash: photo.hash)
        }
        .sheet(item: $model.photoToSend) { photo in
            PhotoComposeView(image: photo.image, maxCaptionLength: ChatViewModel.maxMessageLength) { caption in
                model.photoToSend = nil
                Task { await model.sendPhoto(photo.image, caption: caption) }
            }
        }
        .alert("Not sent", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
        .alert("Not deleted", isPresented: Binding(get: { model.deleteErrorMessage != nil }, set: { if !$0 { model.deleteErrorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.deleteErrorMessage ?? "")
        }
        .reportAlert(for: $model.reportTarget, delete: model.deleteMessage)
    }

    /// Whether the second message joins the run of the first: the same sender, the same day and at most a few
    /// minutes later
    private static func continues(_ first: Message, with second: Message) -> Bool {
        first.senderId == second.senderId
            && Calendar.current.isDate(first.createdAt, inSameDayAs: second.createdAt)
            && second.createdAt.timeIntervalSince(first.createdAt) < 5 * 60
    }

    // MARK: - Title

    /// The image and the name of the chat, which open the chat info
    private func titleButton(users: [Int: User]) -> some View {
        NavigationLink(value: ChatRoute.info(chat)) {
            HStack(spacing: 8) {
                // A tap opens the chat info, not the photo
                ChatImageView(chat: chat, users: users, currentUserId: currentUserId, size: 30, opensPhotoViewer: false)
                VStack(alignment: .leading, spacing: 0) {
                    Text(chat.title(users: users, currentUserId: currentUserId))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    if chat.groupChat {
                        Text(chat.members.count == 1 ? "1 member" : "\(chat.members.count) members")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .lineLimit(1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(chat.title(users: users, currentUserId: currentUserId)), chat info")
    }

    // MARK: - Input

    private var inputBar: some View {
        @Bindable var model = model
        // read here, the label of the photos picker isn't isolated to the main actor
        let isSendingPhoto = model.isSendingPhoto
        let tint = userSettings.appColor
        return HStack(alignment: .bottom, spacing: 8) {
            PhotosPicker(selection: $model.selectedPhoto, matching: .images, photoLibrary: .shared()) {
                Group {
                    if isSendingPhoto {
                        ProgressView()
                    } else {
                        Image(systemName: "plus")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(tint)
                    }
                }
                .frame(width: 36, height: 36)
                .background(Color(.secondarySystemGroupedBackground), in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(model.isSendingPhoto)
            .accessibilityLabel("Send photo")

            HStack(alignment: .bottom, spacing: 4) {
                TextField("Message", text: $model.draft, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.leading, 14)
                    .padding(.vertical, 8)
                    // Not while it's being sent: a disabled field loses the focus, which closes the keyboard on every send
                    .disabled(model.isPending && !model.isSending)

                SendButton(isSending: model.isSending, canSend: model.canSend) {
                    Task { await model.send() }
                }
                .padding(3)
            }
            .messageFieldBackground()
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
    }

    /// The text that couldn't be sent yet, e.g. offline. It's sent again by every sync until the server accepts it.
    private var pendingMessage: some View {
        VStack(alignment: .trailing, spacing: 4) {
            HStack {
                Spacer(minLength: 60)
                Text(chat.input)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(userSettings.appColor.opacity(0.45), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(userSettings.appColorForeground)
            }
            HStack(spacing: 6) {
                if model.isSending {
                    ProgressView()
                        .controlSize(.mini)
                    Text("Sending…")
                } else {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(.red)
                    Text("Not sent, it's sent when you're online")
                    Button("Retry") { Task { await model.retry() } }
                        .fontWeight(.semibold)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
        }
    }
}

/// The day above its first message, as a small capsule
private struct DaySeparator: View {

    let date: Date

    private var text: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        if calendar.isDate(date, equalTo: .now, toGranularity: .year) {
            return date.formatted(.dateTime.weekday(.wide).day().month(.wide))
        }
        return date.formatted(.dateTime.day().month(.wide).year())
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Color(.tertiarySystemFill), in: Capsule())
            .frame(maxWidth: .infinity)
            .padding(.top, 16)
            .padding(.bottom, 4)
    }
}

/// A message as a bubble, the own ones on the right in the app color. The messages a sender sent in a row are
/// grouped: their bubbles are close together, with the time below the last one.
struct MessageBubbleView: View {

    let message: Message
    let isOwn: Bool
    /// Shown above the bubble, for the messages of others in groups
    let senderName: String?
    /// The first message of the sender's run, with a round corner at the top
    var startsRun = true
    /// The last message of the sender's run, with a round corner at the bottom and the time below it
    var endsRun = true
    let onTapPhoto: (String) -> Void
    /// Set for the own messages (and all messages for group admins): "Delete for everyone" in the context menu of the
    /// long press
    var onDelete: (() -> Void)? = nil
    /// Set for the messages of others: "Report…" in the context menu of the long press
    var onReport: (() -> Void)? = nil
    /// Set for the messages of others for group admins: "Delete and report…" in the context menu of the long press
    var onDeleteAndReport: (() -> Void)? = nil

    @Environment(UserSettings.self) private var userSettings

    private var shape: UnevenRoundedRectangle {
        let round: CGFloat = 18
        let joined: CGFloat = 5
        let top = startsRun ? round : joined
        let bottom = endsRun ? round : joined
        return UnevenRoundedRectangle(
            topLeadingRadius: isOwn ? round : top,
            bottomLeadingRadius: isOwn ? round : bottom,
            bottomTrailingRadius: isOwn ? bottom : round,
            topTrailingRadius: isOwn ? top : round,
            style: .continuous
        )
    }

    var body: some View {
        HStack {
            if isOwn {
                Spacer(minLength: 60)
            }
            VStack(alignment: isOwn ? .trailing : .leading, spacing: 3) {
                if let senderName {
                    Text(senderName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                }
                bubble
                if endsRun {
                    Text(message.createdAt, format: .dateTime.hour().minute())
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                }
            }
            if !isOwn {
                Spacer(minLength: 60)
            }
        }
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let imageUrl = message.imageUrl {
                Button {
                    onTapPhoto(imageUrl)
                } label: {
                    // decoded at the size it's shown, full size images make the scrolling stutter
                    ServerImageView(hash: imageUrl, contentMode: .fit, maxPixelSize: 720) {
                        Rectangle()
                            .fill(.gray.opacity(0.3))
                            .frame(width: 200, height: 200)
                            .overlay { ProgressView() }
                    }
                    .frame(maxWidth: 240, maxHeight: 320)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Photo")
                .padding(4)
            }
            if let content = message.content {
                // No text selection: the long press opens the context menu, which has "Copy"
                Text(content)
                    .padding(.horizontal, 12)
                    .padding(.top, message.imageUrl == nil ? 8 : 4)
                    .padding(.bottom, 8)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(isOwn ? userSettings.appColor : Color(.secondarySystemGroupedBackground), in: shape)
        .foregroundStyle(isOwn ? userSettings.appColorForeground : .primary)
        .contentShape(.contextMenuPreview, shape)
        .contextMenu {
            if let content = message.content {
                Button("Copy", systemImage: "doc.on.doc") {
                    UIPasteboard.general.string = content
                }
            }
            if let onDelete {
                Button("Delete for everyone", systemImage: "trash", role: .destructive, action: onDelete)
            }
            if let onDeleteAndReport {
                Button("Delete and report…", systemImage: "trash.slash", role: .destructive, action: onDeleteAndReport)
            }
            if let onReport {
                Button("Report…", systemImage: "exclamationmark.bubble", role: .destructive, action: onReport)
            }
        }
    }
}

/// The picked photo before it's sent, with an optional caption
private struct PhotoComposeView: View {

    let image: UIImage
    let maxCaptionLength: Int
    let onSend: (String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var caption = ""
    @FocusState private var isCaptionFocused: Bool

    private var trimmedCaption: String {
        caption.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding()

                HStack(alignment: .bottom, spacing: 4) {
                    TextField("Add a message", text: $caption, axis: .vertical)
                        .lineLimit(1...5)
                        .focused($isCaptionFocused)
                        .padding(.leading, 14)
                        .padding(.vertical, 8)

                    SendButton(isSending: false, canSend: trimmedCaption.count <= maxCaptionLength) {
                        onSend(trimmedCaption.isEmpty ? nil : trimmedCaption)
                    }
                    .accessibilityLabel("Send photo")
                    .padding(3)
                }
                .messageFieldBackground()
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.bar)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Send photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
