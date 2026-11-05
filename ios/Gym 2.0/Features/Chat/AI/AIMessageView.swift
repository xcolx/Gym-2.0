//
//  AIMessageView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.02.2025.
//

import SwiftUI

/// A message of the Gym-AI chat as a bubble like in the other chats: the user's on the right in the app color, the
/// answers on the left. A failed message has its error, Retry and Delete below it.
struct AIMessageView: View {

    let message: AIChatMessage
    var onRetry: () -> Void = {}
    var onDiscard: () -> Void = {}

    @Environment(UserSettings.self) private var userSettings

    private var isUser: Bool {
        message.role == .user
    }

    var body: some View {
        HStack {
            if isUser {
                Spacer(minLength: 48)
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                Text(formattedContent)
                    .textSelection(.enabled)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(isUser ? userSettings.appColor : Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(isUser ? userSettings.appColorForeground : .primary)
                    .tint(isUser ? userSettings.appColorForeground : userSettings.appColor)
                    .opacity(message.isFailed ? 0.6 : 1)

                switch message.status {
                case .sent:
                    Text(formattedDate)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                case .failed(let error):
                    VStack(alignment: .trailing, spacing: 4) {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.trailing)
                        HStack(spacing: 16) {
                            Button("Delete", role: .destructive, action: onDiscard)
                            Button("Retry", action: onRetry)
                                .fontWeight(.semibold)
                        }
                        .font(.caption)
                        .buttonStyle(.borderless)
                    }
                    .padding(.horizontal, 6)
                }
            }
            if !isUser {
                Spacer(minLength: 48)
            }
        }
    }

    /// The answers of the AI use Markdown, of which bold, italic, code and links are shown.
    private var formattedContent: AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: message.content, options: options)) ?? AttributedString(message.content)
    }

    private var formattedDate: String {
        if Calendar.current.isDateInToday(message.date) {
            return timeFromDate(date: message.date)
        }
        return message.date.formatted(.dateTime.day().month().hour().minute())
    }
}

/// Shown in place of the answer while the AI is answering: three dots in a bubble, and after a few seconds a note that
/// it can take a while
struct AITypingIndicatorView: View {

    @State private var isAnimating = false
    @State private var showsWaitNote = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 8, height: 8)
                        .opacity(isAnimating ? 1 : 0.3)
                        .animation(.easeInOut(duration: 0.6).repeatForever().delay(Double(index) * 0.2), value: isAnimating)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))

            if showsWaitNote {
                Text("Thinking… this can take up to two minutes")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Gym-AI is thinking")
        .onAppear { isAnimating = true }
        .task {
            try? await Task.sleep(for: .seconds(5))
            withAnimation { showsWaitNote = true }
        }
    }
}
