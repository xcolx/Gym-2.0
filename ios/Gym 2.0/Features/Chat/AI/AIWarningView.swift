//
//  AIWarningView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.02.2025.
//

import SwiftUI

/// What to know about the Gym-AI before the first conversation, shown until it's accepted
struct AIWarningView: View {

    @Environment(UserSettings.self) var userSettings

    @AppStorage("acceptedAIWarning") private var acceptedAIWarning: Bool = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 12) {
                    Image("Gym-AI")
                        .resizable()
                        .frame(width: 80, height: 80)
                        .clipShape(Circle())
                        .shadow(color: .black.opacity(0.15), radius: 10, y: 5)
                    Text("Before you start")
                        .font(.title2.bold())
                    Text("A few things to know about Gym-AI.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                .padding(.top, 8)

                VStack(alignment: .leading, spacing: 20) {
                    point("Wrong information", systemImage: "exclamationmark.triangle", text: "The answers provided by Gym-AI might be wrong or incomplete and are not medical advice. Please do not rely on the AI for any important decisions and ask a doctor about injuries, pain or health problems.")
                    point("Data storage", systemImage: "externaldrive", text: "Your conversations are processed and stored on the Gym 2.0 server together with your account, so you can continue them later. Please don't include any personal data such as your name in your questions.")
                    point("Waiting time", systemImage: "hourglass", text: "Since this AI runs on a rather slow server, it can take up to two minutes before the answer is displayed. Depending on the current load of the server, this may vary.")
                    point("Qwen", systemImage: "cpu", text: "The AI is based on the Qwen 3.5 model developed by Alibaba.")
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardBackground()
            }
            .padding(.horizontal)
            .padding(.bottom)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) {
            Button {
                acceptedAIWarning = true
            } label: {
                Text("Accept and continue")
                    .fontWeight(.semibold)
                    .foregroundStyle(userSettings.appColorForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .tint(userSettings.appColor)
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(.bar)
        }
    }

    private func point(_ title: String, systemImage: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(userSettings.appColor)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
