//
//  MessageComposer.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.11.2026.
//

import SwiftUI

/// The round send button in the app color, gray while nothing can be sent
struct SendButton: View {

    let isSending: Bool
    let canSend: Bool
    let action: () -> Void

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        Button(action: action) {
            Group {
                if isSending {
                    ProgressView()
                } else {
                    Image(systemName: "arrow.up")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(canSend ? userSettings.appColorForeground : Color(.systemBackground))
                }
            }
            .frame(width: 30, height: 30)
            .background(isSending ? Color.clear : canSend ? userSettings.appColor : Color(.systemGray3), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!canSend)
        .animation(.snappy(duration: 0.2), value: canSend)
        .accessibilityLabel("Send")
    }
}

extension View {
    /// The rounded field around the text of a message and its send button
    func messageFieldBackground() -> some View {
        background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Color(.separator).opacity(0.5), lineWidth: 0.5)
            }
    }
}
