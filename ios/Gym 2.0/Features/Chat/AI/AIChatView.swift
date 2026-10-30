//
//  AIChatView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 12.02.2025.
//

import SwiftUI
import SwiftData

/// A conversation with the Gym-AI. Without a conversation, a new one is started with the first message.
struct AIChatView: View {

    @Environment(\.aiService) private var aiService
    @Environment(UserSettings.self) var userSettings

    @State private var viewModel: AIChatViewModel
    @State private var userInput: String = ""
    @Query(filter: #Predicate<User> { $0.isCurrentUser }) private var currentUsers: [User]

    private let bottomID = "bottom"

    init(conversation: AIConversationDTO?) {
        _viewModel = State(initialValue: AIChatViewModel(conversation: conversation))
    }

    private var canSend: Bool {
        let content = userInput.trimmingCharacters(in: .whitespacesAndNewlines)
        return viewModel.canSend && !content.isEmpty && content.count <= AIChatViewModel.maxMessageLength
    }

    var body: some View {

        VStack (spacing: 0) {

            ScrollViewReader{ proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(viewModel.messages) { message in
                            HStack{
                                if message.role == .user {
                                    Spacer(minLength: 40)
                                }
                                AIMessageView(
                                    message: message,
                                    currentUser: currentUsers.first,
                                    onRetry: { retry(message) },
                                    onDiscard: { viewModel.discard(message) }
                                )
                                if message.role == .assistant {
                                    Spacer(minLength: 40)
                                }
                            }
                        }

                        if viewModel.isWaitingForAnswer {
                            AITypingIndicatorView()
                        }

                        Color.clear
                            .frame(height: 1)
                            .id(bottomID)
                    }
                    .padding()
                }
                .defaultScrollAnchor(.bottom)
                .onChange(of: viewModel.messages.count) {
                    withAnimation { proxy.scrollTo(bottomID, anchor: .bottom) }
                }
                .onChange(of: viewModel.isWaitingForAnswer) {
                    withAnimation { proxy.scrollTo(bottomID, anchor: .bottom) }
                }
            }
            .overlay {
                if viewModel.isLoading && viewModel.messages.isEmpty {
                    ProgressView()
                } else if let loadError = viewModel.loadError {
                    ContentUnavailableView {
                        Label("Could not load the conversation", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(loadError)
                    } actions: {
                        Button("Try again") { load() }
                    }
                } else if viewModel.messages.isEmpty {
                    emptyState
                }
            }

            Divider()

            HStack (alignment: .bottom) {
                TextField("Ask Gym-AI...", text: $userInput, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .autocorrectionDisabled()

                Button(action: sendMessage) {
                    if viewModel.isWaitingForAnswer {
                        ProgressView()
                            .padding(7)
                    } else {
                        Text("Send")
                            .padding(7)
                            .background(canSend ? userSettings.appColor : Color.gray)
                            .foregroundStyle(.white)
                            .clipShape(.rect(cornerRadius: 10))
                    }
                }
                .disabled(!canSend)
            }
            .padding()
        }
        .navigationTitle(viewModel.title ?? "New conversation")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadIfNeeded() }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image("Gym-AI")
                .resizable()
                .frame(width: 70, height: 70)
                .clipShape(Circle())
            Text("Ask Gym-AI")
                .font(.title2)
                .bold()
            Text("Questions about training, exercises, workout plans, recovery or nutrition.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 40)
    }

    private func sendMessage() {
        guard canSend, let aiService else { return }
        let text = userInput
        userInput = ""
        Task { await viewModel.send(text, using: aiService) }
    }

    private func retry(_ message: AIChatMessage) {
        guard let aiService else { return }
        Task { await viewModel.retry(message, using: aiService) }
    }

    private func load() {
        Task { await loadIfNeeded() }
    }

    private func loadIfNeeded() async {
        guard let aiService else { return }
        await viewModel.load(using: aiService)
    }
}
