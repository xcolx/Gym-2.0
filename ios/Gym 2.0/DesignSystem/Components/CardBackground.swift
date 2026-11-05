//
//  CardBackground.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 03.11.2026.
//

import SwiftUI

extension View {
    /// The rounded card on the grouped background, e.g. of Home and the stats
    func cardBackground() -> some View {
        background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 10, y: 4)
    }
}
