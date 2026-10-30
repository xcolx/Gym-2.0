//
//  BlockedUsersView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import SwiftUI
import SwiftData

/// The users the current user blocked, loaded by the sync. Unblocking and reporting need a connection.
struct BlockedUsersView: View {

    @Environment(\.modelContext) private var context
    @Environment(\.friendService) private var friendService

    var body: some View {
        BlockedUsersContentView(model: BlockedUsersViewModel(friendService: friendService, users: UserRepository(context: context)))
    }
}

private struct BlockedUsersContentView: View {

    @State private var model: BlockedUsersViewModel

    @Query(filter: #Predicate<User> { $0.isBlocked }, sort: \User.username) private var blockedUsers: [User]

    // The view model is created once, later ones of the parent's body are discarded
    init(model: BlockedUsersViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        List {
            ForEach(blockedUsers) { user in
                HStack(spacing: 12) {
                    ProfileIconView(hash: user.profileIconUrl, size: 40, color: user.schemeColor, imageHash: user.profileImageUrl)
                    Text(user.username)
                    Spacer()
                    if model.busyIds.contains(user.serverId) {
                        ProgressView()
                    } else {
                        Button("Unblock") { Task { await model.unblock(user) } }
                            .buttonStyle(.bordered)
                    }
                }
                .contextMenu {
                    Button("Report…", systemImage: "exclamationmark.bubble", role: .destructive) {
                        model.reportTarget = .user(id: user.serverId, username: user.username)
                    }
                }
            }
        }
        .overlay {
            if blockedUsers.isEmpty {
                ContentUnavailableView("No Blocked Users", systemImage: "person.crop.circle.badge.checkmark")
            }
        }
        .navigationTitle("Blocked Users")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Something went wrong", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
        .reportAlert(for: $model.reportTarget)
    }
}
