//
//  PrimaryButtonStyle.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.11.2026.
//

import SwiftUI

/// The filled main button of a screen, dimmed while it can't be used
struct PrimaryButtonStyle: ButtonStyle {

    @Environment(\.isEnabled) private var isEnabled
    @Environment(UserSettings.self) private var userSettings

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(userSettings.appColorForeground)
            // the spinner while loading
            .tint(userSettings.appColorForeground)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(userSettings.appColor, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension View {
    /// The main buttons of a screen, fixed at its bottom above the content
    func bottomActionBar<Actions: View>(@ViewBuilder _ actions: () -> Actions) -> some View {
        safeAreaInset(edge: .bottom) {
            HStack(spacing: 12) {
                actions()
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 8)
            .background(.bar)
        }
    }
}
