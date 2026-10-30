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

    // The view model is created once, later ones of the parent's body are discarded
    init(viewModel: ImportWorkoutsViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        @Bindable var viewModel = viewModel
        VStack(spacing: 30) {
            Text("Import Workouts")
                .font(.title)
                .padding(.top)
            
            HStack {
                Button {
                    viewModel.selectFile(legacy: false)
                } label: {
                    Label("Select File", systemImage: "tray.and.arrow.down")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    viewModel.selectFile(legacy: true)
                } label: {
                    Label("Legacy Import", systemImage: "clock.arrow.circlepath")
                }
                .buttonStyle(.bordered)
            }
            .fileImporter(
                isPresented: $viewModel.showImporter,
                allowedContentTypes: viewModel.isLegacyImport ? ImportWorkoutsViewModel.legacyContentTypes : ImportWorkoutsViewModel.allowedContentTypes,
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    if let url = urls.first {
                        viewModel.importFile(url: url)
                    }
                case .failure(let error):
                    viewModel.importError = error.localizedDescription
                }
            }
            
            if let error = viewModel.importError {
                Text("Error: \(error)").foregroundStyle(.red)
            }
            
            Text("Select a JSON or CSV file exported from Gym 2.0. Use Legacy Import for a CSV file of an earlier version, its exercises are matched to the current ones by name.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            if let legacyResult = viewModel.legacyResult {
                if !legacyResult.renamedExercises.isEmpty {
                    Text("Matched exercises: \(legacyResult.renamedExercises.map { "\($0.legacyName) → \($0.exerciseName)" }.joined(separator: ", "))")
                        .foregroundStyle(.secondary)
                }
                if !legacyResult.unmatchedExerciseNames.isEmpty {
                    Text("\(legacyResult.unmatchedWorkoutCount) workouts are not imported, since these exercises could not be matched: \(legacyResult.unmatchedExerciseNames.joined(separator: ", "))")
                        .foregroundStyle(.orange)
                }
            }
            
            if viewModel.numExisting > 0 {
                Text("\(viewModel.numExisting) workouts of the file exist already and are not imported again.")
                    .foregroundStyle(.secondary)
            }
            
            if !viewModel.missingExerciseNames.isEmpty {
                Text("Not imported, since these exercises do not exist: \(viewModel.missingExerciseNames.joined(separator: ", "))")
                    .foregroundStyle(.orange)
            }

            if !viewModel.invalidWorkouts.isEmpty {
                Text("Not imported, since they contain values that are out of range or more than 100 sets or exercises: \(viewModel.invalidWorkouts.joined(separator: ", "))")
                    .foregroundStyle(.orange)
            }
            
            Spacer()
        }
        .alert(
            confirmationTitle,
            isPresented: $viewModel.showConfirmation,
            actions: {
                Button("Cancel", role: .cancel) {}
                Button("Import", role: .destructive) {
                    viewModel.confirmImport()
                }
            },
            message: {
                if viewModel.legacyResult != nil {
                    Text("The other workouts contain exercises that could not be matched or exist already. This cannot be undone.")
                }
            }
        )
        .padding()
    }

    private var confirmationTitle: String {
        if let legacyResult = viewModel.legacyResult {
            "Do you want to import \(viewModel.numImported)/\(legacyResult.totalCount) correctly mapped workouts?"
        } else {
            "Are you sure you want to import \(viewModel.numImported) Workouts? This cannot be undone."
        }
    }
}

