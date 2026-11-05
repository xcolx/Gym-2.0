//
//  DeleteWorkoutConfirmation.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.11.2026.
//

import SwiftUI

extension View {
    /// Asks twice before the workout in progress is deleted: first whether to continue it or delete it, then whether
    /// the user is sure, since it can't be reverted
    func deleteWorkoutConfirmation(isPresented: Binding<Bool>, onDelete: @escaping () -> Void) -> some View {
        modifier(DeleteWorkoutConfirmation(isPresented: isPresented, onDelete: onDelete))
    }
}

private struct DeleteWorkoutConfirmation: ViewModifier {

    @Binding var isPresented: Bool
    let onDelete: () -> Void

    @State private var asksAgain = false

    func body(content: Content) -> some View {
        content
            .alert("Cancel this workout?", isPresented: $isPresented) {
                Button("Continue workout", role: .cancel) {}
                Button("Delete workout", role: .destructive) {
                    // after this alert is gone, two alerts can't be shown at once
                    Task { @MainActor in asksAgain = true }
                }
            } message: {
                Text("You can continue it, or delete it with all its sets.")
            }
            .alert("Are you sure?", isPresented: $asksAgain) {
                Button("Go back", role: .cancel) {}
                Button("Delete", role: .destructive, action: onDelete)
            } message: {
                Text("The workout is deleted. This can't be reverted.")
            }
    }
}
