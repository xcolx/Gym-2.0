//
//  MuscleLegend.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.11.2026.
//

import SwiftUI

/// The muscles of one color on the highlighted body, with a dot in that color
struct MuscleLegend: View {

    /// The colors of HighlightedBodyView
    static let primaryColor = Color(red: 1, green: 0, blue: 0)
    static let secondaryColor = Color.orange

    let color: Color
    let title: String
    let muscles: [Muscle]

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(title)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            Text(muscles.isEmpty ? "None" : muscles.map(\.name).joined(separator: ", "))
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}
