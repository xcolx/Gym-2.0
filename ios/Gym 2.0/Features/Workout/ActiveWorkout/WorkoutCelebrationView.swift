//
//  WorkoutCelebrationView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI
import UIKit

extension EnvironmentValues {
    @Entry var celebrateWorkout = CelebrateWorkoutAction { _ in }
}

/// Shows the celebration of an ended workout, called with its duration in minutes. Set by MainView.
struct CelebrateWorkoutAction: Equatable {
    let action: (Int) -> Void

    func callAsFunction(_ durationMinutes: Int) {
        action(durationMinutes)
    }

    // Always equal, so that the views that read it don't update whenever MainView does. Its action only sets a state.
    static func == (lhs: Self, rhs: Self) -> Bool { true }
}

/// A shown celebration. A new id restarts the animation, e.g. if two workouts end right after each other.
struct WorkoutCelebration: Identifiable {
    let id = UUID()
    let emojiCount: Int
    /// In the coordinates of the window, where the emojis fly to
    let target: CGPoint

    /// One emoji per two minutes of the workout. At least one, so that short workouts also get one, and limited,
    /// so that a workout that wasn't ended for hours doesn't make the animation stutter.
    init(durationMinutes: Int, target: CGPoint) {
        emojiCount = min(max(durationMinutes / 2, 1), 150)
        self.target = target
    }
}

/// Biceps emojis that explode from the middle of the screen and then fly to the stats tab, where they disappear
struct WorkoutCelebrationView: View {

    let celebration: WorkoutCelebration
    let onFinish: () -> Void

    /// How long the emojis stay scattered before they fly to the stats tab
    static let holdDuration: TimeInterval = 0.5
    static let explosionDuration: TimeInterval = 0.45
    static let flightDuration: TimeInterval = 0.6
    /// Spread over all emojis, so that they arrive one after the other
    static let maxStagger: TimeInterval = 0.5

    @State private var particles: [Particle] = []
    @State private var arrivalHaptics = ArrivalHaptics()

    var body: some View {
        GeometryReader { proxy in
            let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2)
            ZStack {
                ForEach(particles) { particle in
                    CelebrationEmoji(particle: particle, center: center, target: celebration.target) {
                        arrivalHaptics.emojiArrived()
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onAppear {
                particles = Particle.random(count: celebration.emojiCount, in: proxy.size)
                arrivalHaptics.prepare()
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .sensoryFeedback(.impact(weight: .heavy), trigger: particles.count)
        .task {
            let total = Self.explosionDuration + Self.holdDuration + Self.maxStagger + Self.flightDuration
            try? await Task.sleep(for: .seconds(total + 0.1))
            onFinish()
        }
    }
}

private struct Particle: Identifiable {
    let id: Int
    /// Where it lands from the middle of the screen
    let offset: CGSize
    let rotation: Double
    let size: CGFloat
    let stagger: TimeInterval

    static func random(count: Int, in size: CGSize) -> [Particle] {
        let maxRadius = min(size.width, size.height) * 0.42
        return (0..<count).map { index in
            let angle = Double.random(in: 0..<(2 * .pi))
            // the square root spreads them evenly over the circle instead of crowding the middle
            let radius = maxRadius * sqrt(Double.random(in: 0.05...1))
            return Particle(
                id: index,
                offset: CGSize(width: cos(angle) * radius, height: sin(angle) * radius),
                rotation: Double.random(in: -50...50),
                size: CGFloat.random(in: 28...46),
                stagger: count > 1 ? WorkoutCelebrationView.maxStagger * Double(index) / Double(count - 1) : 0
            )
        }
        .shuffled()
    }
}

private struct CelebrationEmoji: View {

    enum Phase {
        case start, exploded, collected
    }

    let particle: Particle
    let center: CGPoint
    let target: CGPoint
    /// When it disappeared at the stats tab
    let onArrival: () -> Void

    @State private var phase = Phase.start

    private var position: CGPoint {
        switch phase {
        case .start: center
        case .exploded: CGPoint(x: center.x + particle.offset.width, y: center.y + particle.offset.height)
        case .collected: target
        }
    }

    var body: some View {
        Text("💪")
            .font(.system(size: particle.size))
            .rotationEffect(.degrees(phase == .start ? 0 : particle.rotation))
            .scaleEffect(phase == .exploded ? 1 : 0.2)
            .opacity(phase == .collected ? 0 : 1)
            .position(position)
            .onAppear {
                withAnimation(.spring(duration: WorkoutCelebrationView.explosionDuration, bounce: 0.35)) {
                    phase = .exploded
                } completion: {
                    let delay = WorkoutCelebrationView.holdDuration + particle.stagger
                    withAnimation(.easeIn(duration: WorkoutCelebrationView.flightDuration).delay(delay)) {
                        phase = .collected
                    } completion: {
                        onArrival()
                    }
                }
            }
    }
}

/// A firm tap whenever an emoji disappears at the stats tab. Many emojis arrive within half a second, so the taps
/// are limited to one every few milliseconds, more would blur into a buzz.
@MainActor
private final class ArrivalHaptics {

    private static let minInterval: TimeInterval = 0.04

    private let generator = UIImpactFeedbackGenerator(style: .medium)
    private var lastTap = Date.distantPast

    func prepare() {
        generator.prepare()
    }

    func emojiArrived() {
        let now = Date()
        guard now.timeIntervalSince(lastTap) >= Self.minInterval else { return }
        lastTap = now
        generator.impactOccurred(intensity: 1)
        generator.prepare()
    }
}

// MARK: - Position of the stats tab

extension UIApplication {
    /// The middle of the tab bar item with the title, in the coordinates of the window.
    /// SwiftUI doesn't give the frames of the tab items, so they are taken from the UIKit tab bar of the TabView.
    func tabBarItemCenter(titled title: String) -> CGPoint? {
        guard let window = (connectedScenes.first as? UIWindowScene)?.windows.first(where: \.isKeyWindow)
                ?? (connectedScenes.first as? UIWindowScene)?.windows.first,
              let tabBar = window.firstSubview(ofType: UITabBar.self),
              let items = tabBar.items, !items.isEmpty
        else { return nil }

        if let itemView = tabBar.firstSubview(where: { $0 is UIControl && $0.accessibilityLabel == title }) {
            return itemView.convert(CGPoint(x: itemView.bounds.midX, y: itemView.bounds.midY), to: window)
        }

        // The items share the width of the tab bar evenly
        guard let index = items.firstIndex(where: { $0.title == title }) else { return nil }
        let frame = tabBar.convert(tabBar.bounds, to: window)
        let itemWidth = frame.width / CGFloat(items.count)
        return CGPoint(x: frame.minX + itemWidth * (CGFloat(index) + 0.5), y: frame.minY + min(frame.height, 49) / 2)
    }
}

private extension UIView {
    func firstSubview<T: UIView>(ofType type: T.Type) -> T? {
        firstSubview(where: { $0 is T }) as? T
    }

    func firstSubview(where matches: (UIView) -> Bool) -> UIView? {
        for subview in subviews {
            if matches(subview) { return subview }
            if let found = subview.firstSubview(where: matches) { return found }
        }
        return nil
    }
}
