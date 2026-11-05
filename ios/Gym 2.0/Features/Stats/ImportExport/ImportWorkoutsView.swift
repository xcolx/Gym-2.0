//
//  ImportWorkoutsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 21.07.2025.
//

import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct ImportWorkoutsView: View {

    @Environment(\.modelContext) private var context

    var body: some View {
        ImportWorkoutsContentView(viewModel: ImportWorkoutsViewModel(workouts: WorkoutRepository(context: context)))
    }
}

private struct ImportWorkoutsContentView: View {

    @State private var viewModel: ImportWorkoutsViewModel
    /// Shown after the import was confirmed, until another file is picked
    @State private var importedCount: Int?

    @Environment(\.dismiss) private var dismiss

    // The view model is created once, later ones of the parent's body are discarded
    init(viewModel: ImportWorkoutsViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        @Bindable var viewModel = viewModel
        NavigationStack {
            Form {
                Section {
                    Button {
                        viewModel.selectFile(legacy: false)
                    } label: {
                        Label("Choose a Gym 2.0 file", systemImage: "doc.badge.plus")
                    }
                } footer: {
                    Text("A JSON or CSV file exported from Gym 2.0. Workouts that exist already are skipped.")
                }

                Section {
                    Button {
                        viewModel.selectFile(legacy: true)
                    } label: {
                        Label("Import from an earlier version", systemImage: "clock.arrow.circlepath")
                    }
                } footer: {
                    Text("A CSV file of an earlier version of the app. Its exercises are matched to the current ones by name.")
                }

                if hasResult {
                    Section("Result") {
                        results
                    }
                }
            }
            .navigationTitle("Import workouts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .fileImporter(
                isPresented: $viewModel.showImporter,
                allowedContentTypes: viewModel.isLegacyImport ? ImportWorkoutsViewModel.legacyContentTypes : ImportWorkoutsViewModel.allowedContentTypes,
                allowsMultipleSelection: false
            ) { result in
                importedCount = nil
                switch result {
                case .success(let urls):
                    if let url = urls.first {
                        viewModel.importFile(url: url)
                    }
                case .failure(let error):
                    viewModel.importError = error.localizedDescription
                }
            }
            .alert(
                confirmationTitle,
                isPresented: $viewModel.showConfirmation,
                actions: {
                    Button("Cancel", role: .cancel) {}
                    Button("Import") {
                        importedCount = viewModel.numImported
                        viewModel.confirmImport()
                    }
                },
                message: {
                    if viewModel.legacyResult != nil {
                        Text("The other workouts contain exercises that could not be matched or exist already. This can't be undone.")
                    } else {
                        Text("This can't be undone.")
                    }
                }
            )
        }
    }

    private var hasResult: Bool {
        importedCount != nil || viewModel.importError != nil || viewModel.numExisting > 0 || !viewModel.missingExerciseNames.isEmpty
            || !viewModel.invalidWorkouts.isEmpty || !(viewModel.legacyResult?.renamedExercises.isEmpty ?? true)
            || !(viewModel.legacyResult?.unmatchedExerciseNames.isEmpty ?? true)
    }

    /// What happened to the workouts of the picked file, problems last
    @ViewBuilder
    private var results: some View {
        if let importedCount {
            resultRow(importedCount == 1 ? "1 workout imported" : "\(importedCount) workouts imported", systemImage: "checkmark.circle.fill", color: .green)
        }
        if let error = viewModel.importError {
            resultRow(error, systemImage: "xmark.octagon.fill", color: .red)
        }
        if viewModel.numExisting > 0 {
            resultRow(viewModel.numExisting == 1 ? "1 workout exists already and is skipped." : "\(viewModel.numExisting) workouts exist already and are skipped.", systemImage: "equal.circle.fill", color: .secondary)
        }
        if let legacyResult = viewModel.legacyResult {
            if !legacyResult.renamedExercises.isEmpty {
                resultRow("Matched: \(legacyResult.renamedExercises.map { "\($0.legacyName) → \($0.exerciseName)" }.joined(separator: ", "))", systemImage: "arrow.left.arrow.right.circle.fill", color: .secondary)
            }
            if !legacyResult.unmatchedExerciseNames.isEmpty {
                resultRow("\(legacyResult.unmatchedWorkoutCount) workouts are skipped, these exercises could not be matched: \(legacyResult.unmatchedExerciseNames.joined(separator: ", "))", systemImage: "exclamationmark.triangle.fill", color: .orange)
            }
        }
        if !viewModel.missingExerciseNames.isEmpty {
            resultRow("Skipped, these exercises don't exist: \(viewModel.missingExerciseNames.joined(separator: ", "))", systemImage: "exclamationmark.triangle.fill", color: .orange)
        }
        if !viewModel.invalidWorkouts.isEmpty {
            resultRow("Skipped, values out of range or more than 100 sets or exercises: \(viewModel.invalidWorkouts.joined(separator: ", "))", systemImage: "exclamationmark.triangle.fill", color: .orange)
        }
    }

    private func resultRow(_ text: String, systemImage: String, color: Color) -> some View {
        Label {
            Text(text)
                .font(.subheadline)
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(color)
        }
    }

    private var confirmationTitle: String {
        if let legacyResult = viewModel.legacyResult {
            "Import \(viewModel.numImported) of \(legacyResult.totalCount) workouts?"
        } else {
            viewModel.numImported == 1 ? "Import 1 workout?" : "Import \(viewModel.numImported) workouts?"
        }
    }
}
