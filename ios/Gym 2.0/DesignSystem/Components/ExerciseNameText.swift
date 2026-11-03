//
//  ExerciseNameText.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 03.11.2026.
//

import SwiftUI

/// The name of an exercise with the verified badge right after its last word, also when the name wraps
struct ExerciseNameText: View {

    let name: String
    let verified: Bool

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        if verified {
            Text("\(name) \(Text(Image(systemName: "checkmark.seal.fill")).foregroundStyle(userSettings.appColor))")
                .accessibilityLabel("\(name), verified")
        } else {
            Text(name)
        }
    }
}
