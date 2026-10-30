//
//  NewGroupChatView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI
import SwiftData
import PhotosUI

/// Creates a group chat with friends. Needs a connection.
struct NewGroupChatView: View {

    /// Called with the stored chat after it was created
    let onCreate: (Chat) -> Void

    @Environment(\.modelContext) private var context
    @Environment(\.chatService) private var chatService
    @Environment(SyncService.self) private var syncService

    static let maxNameLength = NewGroupChatViewModel.maxNameLength

    var body: some View {
        NewGroupChatContentView(
            model: NewGroupChatViewModel(chatService: chatService, syncService: syncService, chats: ChatRepository(context: context)),
            onCreate: onCreate
        )
    }
}

private struct NewGroupChatContentView: View {

    @State private var model: NewGroupChatViewModel
    let onCreate: (Chat) -> Void

    @Environment(\.dismiss) private var dismiss

    @Query(filter: #Predicate<User> { $0.isFriend }, sort: \User.username) private var friends: [User]

    // The view model is created once, later ones of the parent's body are discarded
    init(model: NewGroupChatViewModel, onCreate: @escaping (Chat) -> Void) {
        _model = State(initialValue: model)
        self.onCreate = onCreate
    }

    var body: some View {
        @Bindable var model = model
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 16) {
                        GroupImagePicker(image: model.image, hash: nil, selection: $model.selectedPhoto)
                        TextField("Group name", text: $model.name)
                    }
                    Toggle("Public", isOn: $model.isPublic)
                } footer: {
                    Text(model.isPublic
                         ? "Everyone can find and join a public group, so it can be created without members."
                         : "Only the members you add can see the group. Add at least one friend.")
                }

                Section("Members") {
                    if friends.isEmpty {
                        Text("Add friends first to create a group with them.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(friends) { friend in
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
                }
            }
            .navigationTitle("New Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.isCreating {
                        ProgressView()
                    } else {
                        Button("Create", action: create)
                            .disabled(!model.canCreate)
                    }
                }
            }
            .task(id: model.selectedPhoto) {
                await model.loadSelectedPhoto()
            }
            .alert("Could not create the group", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(model.errorMessage ?? "")
            }
        }
    }

    private func create() {
        Task {
            guard let created = await model.create(friends: friends) else { return }
            dismiss()
            if let chat = created.chat {
                onCreate(chat)
            }
        }
    }
}

/// The group image as a circle that opens the photo picker
struct GroupImagePicker: View {

    /// A newly picked image, shown instead of the stored one
    let image: UIImage?
    let hash: String?
    @Binding var selection: PhotosPickerItem?

    var body: some View {
        PhotosPicker(selection: $selection, matching: .images, photoLibrary: .shared()) {
            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    ServerImageView(hash: hash, contentMode: .fill) {
                        Image(systemName: "camera.fill")
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(.gray)
                    }
                }
            }
            .frame(width: 56, height: 56)
            .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Group image")
    }

    /// A square JPEG of at most 1024 px, the size the server stores
    static func upload(for image: UIImage) -> ImageUpload? {
        let side = min(image.size.width, image.size.height)
        let target = min(side, 1024)
        let scale = target / side
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let square = UIGraphicsImageRenderer(size: CGSize(width: target, height: target), format: format).image { _ in
            image.draw(in: CGRect(x: (target - size.width) / 2, y: (target - size.height) / 2, width: size.width, height: size.height))
        }
        return square.jpegData(compressionQuality: 0.85).map { ImageUpload(data: $0) }
    }
}
