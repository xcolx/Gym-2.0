//
//  SyncProblemsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI

/// Lists what is out of sync right now, opened from the settings
struct SyncProblemsView: View {

    @Environment(SyncService.self) private var syncService

    @State private var isSyncing = false

    var body: some View {
        List {
            ForEach(syncService.problems) { problem in
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Label(problem.title, systemImage: "exclamationmark.triangle.fill")
                            .font(.headline)
                            .foregroundStyle(.red)
                        Text(problem.message)
                        Text(problem.date, format: .dateTime.day().month().hour().minute())
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .overlay {
            if syncService.problems.isEmpty {
                ContentUnavailableView("No Sync Problems", systemImage: "checkmark.icloud", description: Text("Everything is in sync with the server."))
            }
        }
        .navigationTitle("Sync Problems")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if isSyncing {
                    ProgressView()
                } else {
                    Button("Sync Again", systemImage: "arrow.clockwise") {
                        Task {
                            isSyncing = true
                            await syncService.sync()
                            isSyncing = false
                        }
                    }
                }
            }
        }
    }
}
