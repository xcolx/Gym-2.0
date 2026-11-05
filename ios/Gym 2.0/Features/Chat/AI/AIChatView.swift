//
//  AIChatView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 12.02.2025.
//

import SwiftUI

/// A conversation with the Gym-AI. Without a conversation, a new one is started with the first message.
struct AIChatView: View {

    @Environment(\.aiService) private var aiService
    @State private var viewModel: AIChatViewModel
    @State private var userInput: String = ""

    private let bottomID = "bottom"

    init(conversation: AIConversationDTO?) {
        _viewModel = State(initialValue: AIChatViewModel(conversation: conversation))
    }

    private var canSend: Bool {
        let content = userInput.trimmingCharacters(in: .whitespacesAndNewlines)
        return viewModel.canSend && !content.isEmpty && content.count <= AIChatViewModel.maxMessageLength
    }

    /// Tapped in an empty conversation, they fill the field
    private static let examples = [
        "How many sets per week for chest?",
        "What should I eat after training?",
        "Give me a 3-day full body plan",
    ]

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            AIMessageView(
                                message: message,
                                onRetry: { retry(message) },
                                onDiscard: { viewModel.discard(message) }
                            )
                        }

                        if viewModel.isWaitingForAnswer {
                            AITypingIndicatorView()
                        }

                        Color.clear
                            .frame(height: 1)
                            .id(bottomID)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 12)
                }
                .defaultScrollAnchor(.bottom)
                .scrollDismissesKeyboard(.interactively)
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
                } else if viewModel.messages.isEmpty && !viewModel.isWaitingForAnswer {
                    emptyState
                }
            }

            HStack(alignment: .bottom, spacing: 4) {
                TextField("Ask Gym-AI…", text: $userInput, axis: .vertical)
                    .lineLimit(1...5)
                    .autocorrectionDisabled()
                    .padding(.leading, 14)
                    .padding(.vertical, 8)

                SendButton(isSending: viewModel.isWaitingForAnswer, canSend: canSend, action: sendMessage)
                    .padding(3)
            }
            .messageFieldBackground()
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(.bar)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(viewModel.title ?? "New conversation")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadIfNeeded() }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image("Gym-AI")
                .resizable()
                .frame(width: 72, height: 72)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
            Text("Ask Gym-AI")
                .font(.title2.bold())
            Text("Questions about training, exercises, workout plans, recovery or nutrition.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            VStack(spacing: 8) {
                ForEach(Self.examples, id: \.self) { example in
                    Button {
                        userInput = example
                    } label: {
                        Text(example)
                            .font(.subheadline)
                            .foregroundStyle(Color.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 8)
        }
        .padding(.horizontal, 32)
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
