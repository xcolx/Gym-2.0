//
//  MuscleCoverageGaugeView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 03.11.2026.
//

import SwiftUI

/// How much of the body was trained recently, as a speedometer around the highlighted body. The arc is open at the
/// bottom, where the percentage is shown.
struct MuscleCoverageGaugeView<Content: View>: View {

    let percentage: Int
    @ViewBuilder let content: Content

    @Environment(UserSettings.self) var userSettings
    // Starts empty and fills up to the percentage when it's shown
    @State private var shownFraction: Double = 0

    // The part of the circle covered by the arc, the rest is the opening at the bottom
    private let arc = 0.75
    private let lineWidth: CGFloat = 14

    private var fraction: Double {
        min(max(Double(percentage) / 100, 0), 1)
    }

    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0, to: arc)
                .stroke(Color(.systemFill), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(135))

            Circle()
                .trim(from: 0, to: arc * shownFraction)
                .stroke(
                    AngularGradient(
                        colors: [userSettings.appColor.opacity(0.55), userSettings.appColor],
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(360 * arc)
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(135))

            content
                .padding(lineWidth + 22)
                // the body sits a bit higher, above the percentage in the opening
                .offset(y: -12)

            VStack(spacing: 0) {
                Text("\(percentage)%")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: Double(percentage)))
                Text("covered")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, -6)
        }
        .aspectRatio(1, contentMode: .fit)
        .onAppear {
            withAnimation(.easeOut(duration: 0.9)) {
                shownFraction = fraction
            }
        }
        .onChange(of: percentage) {
            withAnimation(.easeOut(duration: 0.5)) {
                shownFraction = fraction
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Muscles covered")
        .accessibilityValue("\(percentage) percent")
    }
}
