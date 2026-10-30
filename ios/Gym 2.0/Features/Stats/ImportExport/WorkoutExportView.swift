//
//  WorkoutExportView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 28.08.2024.
//

import SwiftUI

enum ExportFormat: String, CaseIterable {
    case csv = "CSV"
    case json = "JSON"

    var fileExtension: String {
        rawValue.lowercased()
    }

    var explanation: String {
        switch self {
        case .csv: "One row per set, for spreadsheets like Excel or Numbers."
        case .json: "All workouts with their exercises and sets, for other apps and backups."
        }
    }
}

/// Exports the finished workouts as a file that can be shared or saved, and imported again
struct WorkoutExportView: View {

    let workouts: [Workout]

    @Environment(\.dismiss) private var dismiss

    @State private var format: ExportFormat = .csv
    @State private var fileURL: URL?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Workouts", value: "\(workouts.count)")
                    AppColorSegmentedPicker(options: ExportFormat.allCases, selection: $format) { $0.rawValue }
                } footer: {
                    Text("\(format.explanation) Weights are in kg, times in seconds and distances in meters, so the file can be imported again on any device.")
                }

                Section {
                    if let fileURL {
                        ShareLink(item: fileURL) {
                            Label("Export as \(format.rawValue)", systemImage: "square.and.arrow.up")
                        }
                    } else if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    } else {
                        ProgressView()
                    }
                }
                .disabled(workouts.isEmpty)
            }
            .navigationTitle("Export Workouts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task(id: format) {
                writeFile()
            }
        }
    }

    /// Written to the temporary directory, the share sheet copies it to where the user saves it
    private func writeFile() {
        fileURL = nil
        errorMessage = nil
        let file = WorkoutFile(workouts: workouts)
        let date = Date.now.formatted(.iso8601.year().month().day())
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("Gym 2.0 Workouts \(date).\(format.fileExtension)")
        do {
            switch format {
            case .csv: try file.csv().write(to: url, atomically: true, encoding: .utf8)
            case .json: try file.json().write(to: url, options: .atomic)
            }
            fileURL = url
        } catch {
            errorMessage = "The file could not be created: \(error.localizedDescription)"
        }
    }
}
