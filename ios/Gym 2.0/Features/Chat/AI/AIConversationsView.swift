//
//  AIConversationsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import SwiftUI

extension EnvironmentValues {
    @Entry var aiService: AIService? = nil
}

/// The screens of the Gym-AI. Register them with `aiNavigationDestinations()` at the root of the NavigationStack they are pushed onto.
enum AIChatRoute: Hashable {
    case conversations
    case conversation(AIConversationDTO)
    case new
}

extension View {
    func aiNavigationDestinations() -> some View {
        navigationDestination(for: AIChatRoute.self) { route in
            switch route {
            case .conversations:
                AIConversationsView()
            case .conversation(let conversation):
                AIChatView(conversation: conversation)
            case .new:
                AIChatView(conversation: nil)
            }
        }
    }
}

/// The past conversations with the Gym-AI, from which they can be opened again or a new one can be started.
struct AIConversationsView: View {

    @Environment(\.aiService) private var aiService
    @Environment(UserSettings.self) var userSettings

    @AppStorage("acceptedAIWarning") private var acceptedAIWarning: Bool = false

    @State private var viewModel = AIConversationsViewModel()
    @State private var renamedConversation: AIConversationDTO?
    @State private var newTitle: String = ""

    var body: some View {
        Group {
            if !acceptedAIWarning {
                AIWarningView()
            } else {
                conversationList
            }
        }
        .navigationTitle("Gym-AI")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var conversationList: some View {
        List {
            ForEach(viewModel.conversations) { conversation in
                NavigationLink(value: AIChatRoute.conversation(conversation)) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(conversation.title ?? "New conversation")
                            .lineLimit(1)
                        Text(conversation.updatedAt, format: .relative(presentation: .named))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .swipeActions {
                    Button("Delete", role: .destructive) {
                        guard let aiService else { return }
                        Task { await viewModel.delete(conversation, using: aiService) }
                    }
                    Button("Rename") {
                        newTitle = conversation.title ?? ""
                        renamedConversation = conversation
                    }
                    .tint(userSettings.appColor)
                }
            }
        }
        .overlay {
            if !viewModel.hasLoaded {
                if let loadError = viewModel.loadError {
                    ContentUnavailableView {
                        Label("Gym-AI is unreachable", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(loadError)
                    } actions: {
                        Button("Try again") { Task { await load() } }
                    }
                } else {
                    ProgressView()
                }
            } else if viewModel.conversations.isEmpty {
                ContentUnavailableView {
                    Label("No conversations yet", systemImage: "bubble.left.and.text.bubble.right")
                } description: {
                    Text("Ask Gym-AI about training, exercises, workout plans, recovery or nutrition.")
                } actions: {
                    NavigationLink(value: AIChatRoute.new) {
                        Text("New conversation")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(userSettings.appColor)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: AIChatRoute.new) {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("New conversation")
            }
        }
        // Also reloads when coming back from a conversation, which may have a new message or title
        .task { await load() }
        .refreshable { await load() }
        .alert("Rename conversation", isPresented: isRenaming) {
            TextField("Title", text: $newTitle)
            Button("Cancel", role: .cancel) {}
            Button("Save") {
                guard let conversation = renamedConversation, let aiService else { return }
                let title = String(newTitle.prefix(50))
                Task { await viewModel.rename(conversation, to: title, using: aiService) }
            }
        }
        .alert("Error", isPresented: hasActionError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.actionError ?? "")
        }
    }

    private var isRenaming: Binding<Bool> {
        Binding(
            get: { renamedConversation != nil },
            set: { if !$0 { renamedConversation = nil } }
        )
    }

    private var hasActionError: Binding<Bool> {
        Binding(
            get: { viewModel.actionError != nil },
            set: { if !$0 { viewModel.actionError = nil } }
        )
    }

    private func load() async {
        guard let aiService else { return }
        await viewModel.load(using: aiService)
    }
}

/// A thin banner that opens the conversations with the Gym-AI.
struct AIConversationsBannerView: View {

    @Environment(UserSettings.self) var userSettings

    var body: some View {
        NavigationLink(value: AIChatRoute.conversations) {
            HStack(spacing: 10) {
                Image("Gym-AI")
                    .resizable()
                    .frame(width: 28, height: 28)
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 0) {
                    Text("Gym-AI")
                        .font(.subheadline)
                        .bold()
                    Text("Open your AI conversations")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            // Without ignoresSafeAreaEdges the color would extend up behind the navigation bar
            .background(userSettings.appColor.opacity(0.15), ignoresSafeAreaEdges: [])
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
