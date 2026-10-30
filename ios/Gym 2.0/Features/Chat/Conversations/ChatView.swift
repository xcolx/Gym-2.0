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
            ContentUnavailableView("Chat Not Available", systemImage: "bubble.left.and.exclamationmark.bubble.right", description: Text("You're no longer a member of this chat."))
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
                    LazyVStack(spacing: 6) {
                        ForEach(Array(messages.enumerated()), id: \.element.serverId) { index, message in
                            let previous = index > 0 ? messages[index - 1] : nil
                            if previous.map({ !Calendar.current.isDate($0.createdAt, inSameDayAs: message.createdAt) }) ?? true {
                                Text(message.createdAt, format: .dateTime.weekday(.wide).day().month(.wide))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .padding(.vertical, 6)
                            }
                            MessageBubbleView(
                                message: message,
                                isOwn: message.senderId == currentUserId,
                                // the sender's name above the first of their messages in a row in groups
                                senderName: chat.groupChat && message.senderId != currentUserId && previous?.senderId != message.senderId
                                    ? message.senderId.flatMap { users[$0]?.username } ?? "Unknown user"
                                    : nil,
                                onTapPhoto: { model.viewedPhoto = ViewedPhoto(hash: $0) },
                                onDelete: message.senderId == currentUserId || isAdmin ? { Task { await model.delete(message) } } : nil,
                                onReport: message.senderId == currentUserId ? nil : {
                                    model.reportTarget = .message(id: message.serverId, senderName: message.senderId.flatMap { users[$0]?.username })
                                },
                                onDeleteAndReport: message.senderId == currentUserId || !isAdmin ? nil : {
                                    model.reportTarget = .message(id: message.serverId, senderName: message.senderId.flatMap { users[$0]?.username }, deletes: true)
                                }
                            )
                        }

                        if model.isPending {
                            pendingMessage
                        }

                        Color.clear
                            .frame(height: 1)
                            .id(bottomID)
                    }
                    .padding()
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
                    ContentUnavailableView("No Messages", systemImage: "bubble.left", description: Text("Say hi!"))
                }
            }

            Divider()

            if let blockedReason {
                Text(blockedReason)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding()
            } else {
                inputBar
            }
        }
        .navigationTitle(chat.title(users: users, currentUserId: currentUserId))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: ChatRoute.info(chat)) {
                    // A tap opens the chat info, not the photo
                    ChatImageView(chat: chat, users: users, currentUserId: currentUserId, size: 32, opensPhotoViewer: false)
                }
                .accessibilityLabel("Chat info")
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

    // MARK: - Input

    private var inputBar: some View {
        @Bindable var model = model
        // read here, the label of the photos picker isn't isolated to the main actor
        let isSendingPhoto = model.isSendingPhoto
        return HStack(alignment: .bottom, spacing: 10) {
            PhotosPicker(selection: $model.selectedPhoto, matching: .images, photoLibrary: .shared()) {
                if isSendingPhoto {
                    ProgressView()
                        .frame(width: 28, height: 34)
                } else {
                    Image(systemName: "photo")
                        .font(.title3)
                        .frame(width: 28, height: 34)
                }
            }
            .disabled(model.isSendingPhoto)
            .accessibilityLabel("Send photo")

            TextField("Message", text: $model.draft, axis: .vertical)
                .lineLimit(1...5)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                // Not while it's being sent: a disabled field loses the focus, which closes the keyboard on every send
                .disabled(model.isPending && !model.isSending)

            Button {
                Task { await model.send() }
            } label: {
                if model.isSending {
                    ProgressView()
                        .frame(width: 34, height: 34)
                } else {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(model.canSend ? userSettings.appColor : Color.gray)
                }
            }
            .disabled(!model.canSend)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    /// The text that couldn't be sent yet, e.g. offline. It's sent again by every sync until the server accepts it.
    private var pendingMessage: some View {
        VStack(alignment: .trailing, spacing: 4) {
            HStack {
                Spacer(minLength: 60)
                Text(chat.input)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(userSettings.appColor.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
                    .foregroundStyle(.white)
            }
            HStack(spacing: 12) {
                Text(model.isSending ? "Sending..." : "Not sent yet, it's sent when you're online")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !model.isSending {
                    Button("Retry") { Task { await model.retry() } }
                        .font(.caption)
                }
            }
        }
    }
}

/// A message as a bubble, the own ones on the right in the app color
struct MessageBubbleView: View {

    let message: Message
    let isOwn: Bool
    /// Shown above the bubble, for the messages of others in groups
    let senderName: String?
    let onTapPhoto: (String) -> Void
    /// Set for the own messages (and all messages for group admins): "Delete for Everyone" in the context menu of the
    /// long press
    var onDelete: (() -> Void)? = nil
    /// Set for the messages of others: "Report…" in the context menu of the long press
    var onReport: (() -> Void)? = nil
    /// Set for the messages of others for group admins: "Delete and Report…" in the context menu of the long press
    var onDeleteAndReport: (() -> Void)? = nil

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        HStack {
            if isOwn {
                Spacer(minLength: 60)
            }
            VStack(alignment: isOwn ? .trailing : .leading, spacing: 2) {
                if let senderName {
                    Text(senderName)
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 4)
                }
                VStack(alignment: .leading, spacing: 6) {
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
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Photo")
                    }
                    if let content = message.content {
                        // No text selection: the long press opens the context menu, which has "Copy"
                        Text(content)
                    }
                    Text(message.createdAt, format: .dateTime.hour().minute())
                        .font(.caption2)
                        .opacity(0.7)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .fixedSize(horizontal: false, vertical: true)
                .background(isOwn ? userSettings.appColor : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                .foregroundStyle(isOwn ? .white : .primary)
                .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 16))
                .contextMenu {
                    if let content = message.content {
                        Button("Copy", systemImage: "doc.on.doc") {
                            UIPasteboard.general.string = content
                        }
                    }
                    if let onDelete {
                        Button("Delete for Everyone", systemImage: "trash", role: .destructive, action: onDelete)
                    }
                    if let onDeleteAndReport {
                        Button("Delete and Report…", systemImage: "trash.slash", role: .destructive, action: onDeleteAndReport)
                    }
                    if let onReport {
                        Button("Report…", systemImage: "exclamationmark.bubble", role: .destructive, action: onReport)
                    }
                }
            }
            if !isOwn {
                Spacer(minLength: 60)
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
    @Environment(UserSettings.self) private var userSettings
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

                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Add a message", text: $caption, axis: .vertical)
                        .lineLimit(1...5)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .focused($isCaptionFocused)

                    Button {
                        onSend(trimmedCaption.isEmpty ? nil : trimmedCaption)
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 30))
                            .foregroundStyle(trimmedCaption.count <= maxCaptionLength ? userSettings.appColor : Color.gray)
                    }
                    .disabled(trimmedCaption.count > maxCaptionLength)
                    .accessibilityLabel("Send photo")
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }
            .navigationTitle("Send Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
