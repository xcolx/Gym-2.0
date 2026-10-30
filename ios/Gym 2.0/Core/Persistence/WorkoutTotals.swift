//
//  WorkoutTotals.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 25.10.2026.
//

import Foundation
import Observation
import SwiftData

/// The summary of all finished workouts, shown on Home and at the top of the stats.
///
/// Computing it reads every workout exercise and decodes its set arrays, which took about a second with many workouts.
/// Done in the bodies of the views, it ran on every tab switch and every save. It's now computed once in the
/// background after every save of the context, the views only show the last result.
@MainActor
@Observable
final class WorkoutTotals {

    /// Nil until the first calculation is done
    private(set) var summary: StatsSummary?

    @ObservationIgnored private let container: ModelContainer
    @ObservationIgnored private var saveObserver: NSObjectProtocol?
    @ObservationIgnored private var needsCalculation = false
    /// Runs until no save came in during the last calculation. Tests wait for it.
    @ObservationIgnored private(set) var calculation: Task<Void, Never>?

    init(context: ModelContext) {
        container = context.container
        reload()

        // Also the saves of the sync, e.g. after workouts were pulled from the server
        saveObserver = NotificationCenter.default.addObserver(forName: ModelContext.didSave, object: context, queue: nil) { [weak self] _ in
            Task { @MainActor in
                self?.reload()
            }
        }
    }

    /// Calculates the summary again. The many saves of a sync are combined: while a calculation runs, only one more
    /// follows it.
    func reload() {
        needsCalculation = true
        guard calculation == nil else { return }
        calculation = Task {
            while needsCalculation {
                needsCalculation = false
                summary = await Self.calculate(in: container)
            }
            calculation = nil
        }
    }

    // In a context of its own off the main thread, which only sees the saved workouts
    private nonisolated static func calculate(in container: ModelContainer) async -> StatsSummary {
        await Task.detached(priority: .userInitiated) {
            let context = ModelContext(container)
            let descriptor = FetchDescriptor<Workout>(predicate: #Predicate { $0.inProgress == false })
            let workouts = (try? context.fetch(descriptor)) ?? []
            return StatsCalculator.summary(of: workouts)
        }.value
    }
}
