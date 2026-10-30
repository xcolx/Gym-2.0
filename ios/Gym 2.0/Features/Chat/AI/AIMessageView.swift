//
//  AIMessageView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.02.2025.
//

import SwiftUI

struct AIMessageView: View {

    let message: AIChatMessage
    /// The current user, whose profile icon is shown next to their messages. Nil before the first sync loaded it.
    let currentUser: User?
    var onRetry: () -> Void = {}
    var onDiscard: () -> Void = {}

    private var isUser: Bool {
        message.role == .user
    }

    var body: some View {

        VStack (alignment: .leading, spacing: 4) {
            HStack {
                if isUser {
                    ProfileIconView(hash: currentUser?.profileIconUrl ?? "", size: 25, color: currentUser?.schemeColor)
                } else {
                    Circle()
                        .frame(width: 25, height: 25)
                        .overlay{
                            Image("Gym-AI")
                                .resizable()
                                .clipShape(Circle())
                        }
                }
                Text(isUser ? "You" : "Gym-AI")
                    .bold()
            }

            Group {
                Text(formattedContent)
                    .textSelection(.enabled)

                switch message.status {
                case .sent:
                    Text(formattedDate)
                        .font(.footnote)
                        .foregroundStyle(Color.gray)
                case .failed(let error):
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Color.red)
                    HStack {
                        Button("Retry", action: onRetry)
                        Button("Delete", role: .destructive, action: onDiscard)
                    }
                    .font(.footnote.bold())
                    .buttonStyle(.borderless)
                }
            }
            .padding(.leading, 30)
        }
        .padding(.trailing, 30)
        .padding(8)
        .background((isUser ? Color.green : Color.red).opacity(0.2))
        .clipShape(.rect(cornerRadius: 8))
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

/// Shown in place of the answer while the AI is answering.
struct AITypingIndicatorView: View {

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .frame(width: 25, height: 25)
                .overlay {
                    Image("Gym-AI")
                        .resizable()
                        .clipShape(Circle())
                }
            ProgressView()
            Text("Gym-AI is thinking...")
                .font(.footnote)
                .foregroundStyle(Color.gray)
        }
        .padding(8)
        .background(Color.red.opacity(0.2))
        .clipShape(.rect(cornerRadius: 8))
    }
}
