//
//  ShareSheet.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.11.2026.
//

import SwiftUI

/// The system share sheet, which unlike ShareLink tells when it's done and can share what is made when tapped
struct ShareSheet: UIViewControllerRepresentable {

    let items: [Any]
    let onComplete: () -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in
            onComplete()
        }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
