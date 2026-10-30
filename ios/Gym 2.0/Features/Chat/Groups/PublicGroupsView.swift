//
//  PublicGroupsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI
import SwiftData

/// All public group chats, loaded online. Joining one opens it.
struct PublicGroupsView: View {

    @Binding var path: NavigationPath

    @Environment(\.modelContext) private var context
    @Environment(\.chatService) private var chatService
    @Environment(SyncService.self) private var syncService

    var body: some View {
        PublicGroupsContentView(model: PublicGroupsViewModel(
            chatService: chatService,
            syncService: syncService,
            chats: ChatRepository(context: context),
            openChat: { path.append(ChatRoute.chat($0)) }
        ))
    }
}

private struct PublicGroupsContentView: View {

    @State private var model: PublicGroupsViewModel

    @Query private var chats: [Chat]
    @Query(filter: #Predicate<User> { $0.isBlocked }, sort: \User.username) private var blockedUsers: [User]

    // The view model is created once, later ones of the parent's body are discarded
    init(model: PublicGroupsViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        let joinedIds = Set(chats.map(\.serverId))
        let filteredGroups = model.filteredGroups
        List(filteredGroups) { group in
            Button {
                Task { await model.open(group, joined: joinedIds.contains(group.id), blockedUsers: blockedUsers) }
            } label: {
                HStack(spacing: 12) {
                    ServerImageView(hash: group.imageUrl, contentMode: .fill) {
                        Image(systemName: "person.3.fill")
                            .resizable()
                            .scaledToFit()
                            .padding(10)
                            .foregroundStyle(.white)
                            .background(.gray)
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(Circle())
                    .opensPhotoViewer(hash: group.imageUrl)

                    VStack(alignment: .leading) {
                        Text(group.name ?? "Group")
                            .foregroundStyle(.primary)
                        Text(group.members.count == 1 ? "1 member" : "\(group.members.count) members")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if model.joiningId == group.id {
                        ProgressView()
                    } else if joinedIds.contains(group.id) {
                        Text("Joined")
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Join")
                            .bold()
                    }
                }
            }
            .disabled(model.joiningId != nil)
            .contextMenu {
                Button("Report…", systemImage: "exclamationmark.bubble", role: .destructive) {
                    model.reportTarget = .chat(id: group.id, name: group.name ?? "Group")
                }
            }
        }
        .overlay {
            if model.groups == nil && model.loadError == nil {
                ProgressView()
            } else if let loadError = model.loadError {
                ContentUnavailableView {
                    Label("Could not load the groups", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
            } else if filteredGroups.isEmpty {
                ContentUnavailableView("No Public Groups", systemImage: "globe", description: Text("Create a group and make it public so others can join."))
            }
        }
        .searchable(text: $model.searchText)
        .navigationTitle("Public Groups")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load() }
        .task { await model.load() }
        .alert("Join the group?", isPresented: Binding(get: { model.pendingJoin != nil }, set: { if !$0 { model.pendingJoin = nil } }), presenting: model.pendingJoin) { pending in
            Button("Cancel", role: .cancel) {}
            Button("Join") { Task { await model.join(pending.group) } }
        } message: { pending in
            Text(pending.warning)
        }
        .reportAlert(for: $model.reportTarget)
        .alert("Could not join", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
    }
}
