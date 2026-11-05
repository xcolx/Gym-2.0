//
//  ExercisesView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 17.08.2024.
//

import SwiftUI
import SwiftData

/// All exercises to pick from for a workout, filtered and searched. Tapping an exercise adds it to the picked ones,
/// again with every tap, since an exercise can be in a workout more than once. "Add" appends them in the picked order
/// to `exerciseList` and closes the sheet.
struct ExercisesView: View {

    @Binding var showExercisesView: Bool
    @Binding var exerciseList: [Exercise]

    @State private var searchText = ""
    @State private var selectedMuscleGroup: MuscleGroup?
    @State private var selectedPrimaryMuscle: Muscle?
    @State private var selectedEquipment: Equipment?
    /// In the order they were picked, the same exercise more than once if it was picked again
    @State private var picked: [Exercise] = []
    @State private var path: [Exercise] = []

    @State private var showCreateExerciseSheet: Bool = false

    @Query(
        sort: [SortDescriptor(\Exercise.name, order: .forward)]
    ) private var exercises: [Exercise]

    @Query(sort: \MuscleGroup.name) private var muscleGroups: [MuscleGroup]
    @Query(sort: \Muscle.name) private var muscles: [Muscle]
    @Query(sort: \Equipment.name) private var equipment: [Equipment]

    @Environment(UserSettings.self) private var userSettings

    private var filteredExercises: [Exercise] {
        var filteredExercises: [Exercise] = exercises

        if let selectedMuscleGroup {
            filteredExercises = filteredExercises.filter { $0.muscleGroupId == selectedMuscleGroup.serverId }
        }
        if let selectedEquipment {
            filteredExercises = filteredExercises.filter { $0.equipmentId == selectedEquipment.serverId }
        }
        if let selectedPrimaryMuscle {
            filteredExercises = filteredExercises.filter { $0.primaryMuscleIds.contains(selectedPrimaryMuscle.serverId) }
        }

        // best match first
        if !searchText.isEmpty {
            filteredExercises = FuzzySearch.filter(filteredExercises, query: searchText) { $0.searchNames }
        }
        return filteredExercises
    }

    // The exercises grouped by their first letter, "#" for names starting with something else
    private func exercisesByLetter(_ exercises: [Exercise]) -> [(letter: String, exercises: [Exercise])] {
        let groups = Dictionary(grouping: exercises) { exercise -> String in
            let first = exercise.name.trimmingCharacters(in: .whitespaces).prefix(1)
                .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
                .uppercased()
            return first.first?.isLetter == true ? first : "#"
        }
        return groups.keys
            .sorted { ($0 == "#") != ($1 == "#") ? $1 == "#" : $0 < $1 }
            .map { ($0, groups[$0] ?? []) }
    }

    private var hasFilter: Bool {
        selectedMuscleGroup != nil || selectedPrimaryMuscle != nil || selectedEquipment != nil
    }

    var body: some View {
        let filtered = filteredExercises
        let details = RowDetails(muscleGroups: muscleGroups, equipment: equipment)
        NavigationStack(path: $path) {
            List {
                if searchText.isEmpty {
                    ForEach(Array(exercisesByLetter(filtered).enumerated()), id: \.element.letter) { index, group in
                        Section {
                            ForEach(group.exercises) { exercise in
                                exerciseRow(exercise, details: details)
                            }
                        } header: {
                            if index == 0 {
                                Text("\(countText(filtered.count)) · \(group.letter)")
                            } else {
                                Text(group.letter)
                            }
                        }
                    }
                } else {
                    // Ranked by how well they match, so not split by letter
                    Section(countText(filtered.count)) {
                        ForEach(filtered) { exercise in
                            exerciseRow(exercise, details: details)
                        }
                    }
                }
            }
            .listSectionSpacing(.compact)
            .safeAreaInset(edge: .top, spacing: 0) {
                filterChips
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(Color(.systemGroupedBackground))
            }
            .overlay {
                if filtered.isEmpty {
                    ContentUnavailableView {
                        Label("No exercises found", systemImage: "magnifyingglass")
                    } description: {
                        Text(hasFilter ? "Try other filters or another search." : "Try another search, or create the exercise.")
                    } actions: {
                        Button("Create exercise") { showCreateExerciseSheet = true }
                    }
                }
            }
            .navigationTitle("Exercises")
            .navigationBarTitleDisplayMode(.inline)
            // By value, see StatsRoute
            .navigationDestination(for: Exercise.self) { exercise in
                ExerciseDetailView(exercise: exercise, picked: $picked)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showExercisesView = false }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateExerciseSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Create exercise")
                }
            }
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always))
            .bottomActionBar {
                if !picked.isEmpty {
                    Button {
                        picked.removeAll()
                    } label: {
                        Text("Clear")
                            .font(.headline)
                            .frame(height: 52)
                            .padding(.horizontal, 16)
                            .background(Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                Button(action: add) {
                    Text(picked.isEmpty ? "Tap exercises to add them" : picked.count == 1 ? "Add 1 exercise" : "Add \(picked.count) exercises")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(picked.isEmpty)
            }
            .animation(.snappy(duration: 0.2), value: picked.isEmpty)
        }
        // Not on a view inside the stack: its presentations are created anew when the app goes to the background,
        // which lost the input of the exercise being created
        .fullScreenCover(isPresented: $showCreateExerciseSheet) {
            CreateExerciseView(exercise: nil, deletedExercise: Binding.constant(false))
        }
    }

    private func countText(_ count: Int) -> String {
        count == 1 ? "1 exercise" : "\(count) exercises"
    }

    private func add() {
        exerciseList.append(contentsOf: picked)
        showExercisesView = false
    }

    // MARK: - Filters

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if hasFilter {
                    Button {
                        withAnimation {
                            selectedMuscleGroup = nil
                            selectedPrimaryMuscle = nil
                            selectedEquipment = nil
                        }
                    } label: {
                        FilterChipLabel(title: "Clear", isActive: false, systemImage: "xmark")
                    }
                    .buttonStyle(.plain)
                }
                FilterChip(title: "Muscle group", options: muscleGroups, name: \.name, selection: $selectedMuscleGroup)
                FilterChip(title: "Muscle", options: muscles, name: \.name, selection: $selectedPrimaryMuscle)
                FilterChip(title: "Equipment", options: equipment, name: \.name, selection: $selectedEquipment)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
        }
    }

    // MARK: - Rows

    private func exerciseRow(_ exercise: Exercise, details: RowDetails) -> some View {
        let positions = picked.indices.filter { picked[$0] == exercise }.map { $0 + 1 }
        let worked = [exercise].musclesWorked(in: muscles)
        return HStack(spacing: 12) {
            HStack(spacing: 12) {
                HighlightedBodyView(primaryMuscles: worked.primary, secondaryMuscles: worked.secondary)
                    .frame(width: 40, height: 48)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    ExerciseNameText(name: exercise.name, verified: exercise.verified)
                        .font(.body.weight(.medium))
                    Text(details.text(for: exercise))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                if !positions.isEmpty {
                    PickedBadge(positions: positions)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.snappy(duration: 0.2)) { picked.append(exercise) }
            }

            if !positions.isEmpty {
                Button {
                    withAnimation(.snappy(duration: 0.2)) {
                        if let last = picked.lastIndex(of: exercise) { picked.remove(at: last) }
                    }
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Remove \(exercise.name) once")
            }

            // a button, not a NavigationLink, which would make the whole row open the details
            Button {
                path.append(exercise)
            } label: {
                Image(systemName: "info.circle")
                    .font(.title3)
                    .foregroundStyle(userSettings.appColor)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Details of \(exercise.name)")
        }
        .listRowBackground(positions.isEmpty ? Color(.secondarySystemGroupedBackground) : userSettings.appColor.opacity(0.1))
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Add") { picked.append(exercise) }
    }
}

/// "Chest · Barbell" below the name of an exercise
private struct RowDetails {

    let groupNames: [Int: String]
    let equipmentNames: [Int: String]

    init(muscleGroups: [MuscleGroup], equipment: [Equipment]) {
        groupNames = Dictionary(muscleGroups.map { ($0.serverId, $0.name) }, uniquingKeysWith: { first, _ in first })
        equipmentNames = Dictionary(equipment.map { ($0.serverId, $0.name) }, uniquingKeysWith: { first, _ in first })
    }

    func text(for exercise: Exercise) -> String {
        [groupNames[exercise.muscleGroupId], equipmentNames[exercise.equipmentId]].compactMap { $0 }.joined(separator: " · ")
    }
}

/// The positions of a picked exercise among the picked ones, e.g. "2" or "1, 4"
private struct PickedBadge: View {

    let positions: [Int]

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "checkmark")
                .font(.caption2.weight(.heavy))
            Text(positions.map(String.init).joined(separator: ", "))
                .font(.caption.weight(.bold))
                .monospacedDigit()
        }
        .foregroundStyle(userSettings.appColorForeground)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(userSettings.appColor, in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(positions.count == 1 ? "Added at position \(positions[0])" : "Added at positions \(positions.map(String.init).joined(separator: ", "))")
    }
}

/// A filter as a chip with a menu of its options, filled in the app color with its value while it's set
private struct FilterChip<Option: Hashable>: View {

    let title: String
    let options: [Option]
    let name: KeyPath<Option, String>
    @Binding var selection: Option?

    var body: some View {
        Menu {
            Picker(title, selection: $selection) {
                Text("All").tag(nil as Option?)
                ForEach(options, id: \.self) { option in
                    Text(option[keyPath: name]).tag(option as Option?)
                }
            }
        } label: {
            FilterChipLabel(title: selection.map { $0[keyPath: name] } ?? title, isActive: selection != nil, systemImage: "chevron.down")
        }
        .buttonStyle(.plain)
    }
}

private struct FilterChipLabel: View {

    let title: String
    let isActive: Bool
    let systemImage: String

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        HStack(spacing: 4) {
            Text(title)
                .lineLimit(1)
            Image(systemName: systemImage)
                .font(.caption2.weight(.bold))
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(isActive ? userSettings.appColorForeground : Color.primary)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(isActive ? userSettings.appColor : Color(.secondarySystemGroupedBackground), in: Capsule())
    }
}
