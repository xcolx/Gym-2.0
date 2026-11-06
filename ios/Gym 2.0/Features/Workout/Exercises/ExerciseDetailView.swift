//
//  ExerciseDetailView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 18.08.2024.
//

import SwiftUI
import SwiftData

/// An exercise with its images, muscles, description and what's tracked per set. From the exercise list it can be
/// added to the picked exercises, again if it's already picked.
struct ExerciseDetailView: View {

    @State var exercise: Exercise
    /// The exercises picked in the exercise list. Nil in the performing workout, there the exercise is already part of it.
    var picked: Binding<[Exercise]>? = nil

    @State private var deletedExercise: Bool = false
    @State private var showSheet: Bool = false

    @Query(sort: \Muscle.name) private var muscles: [Muscle]

    @Environment(\.dismiss) private var dismiss
    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        let worked = [exercise].musclesWorked(in: muscles)
        let pickedCount = picked?.wrappedValue.count { $0 == exercise } ?? 0
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                images

                VStack(alignment: .leading, spacing: 4) {
                    ExerciseNameText(name: exercise.name, verified: exercise.verified)
                        .font(.title2.bold())
                    Text([exercise.muscleGroup?.name, exercise.equipment?.name].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if !exercise.aliases.isEmpty {
                        aliases
                            .padding(.top, 8)
                    }
                }
                .padding(.horizontal, 4)

                card("Muscles") {
                    HStack(alignment: .center, spacing: 16) {
                        HighlightedBodyView(primaryMuscles: worked.primary, secondaryMuscles: worked.secondary)
                            .frame(height: 190)
                        VStack(alignment: .leading, spacing: 12) {
                            MuscleLegend(color: MuscleLegend.primaryColor, title: "Main", muscles: worked.primary)
                            if !worked.secondary.isEmpty {
                                MuscleLegend(color: MuscleLegend.secondaryColor, title: "Also", muscles: worked.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                card("How to") {
                    if let description = exercise.exerciseDescription, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text("No description yet.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                card("Tracked per set") {
                    FlowLayout(spacing: 8) {
                        ForEach(exercise.trackedMetrics, id: \.self) { metric in
                            Text(metric.name)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(userSettings.appColor)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(userSettings.appColor.opacity(0.15), in: Capsule())
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // verified exercises can't be changed
            if exercise.canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { showSheet = true }
                }
            }
        }
        // no bar in the performing workout, there's nothing to add the exercise to
        .bottomActionBar(isPresented: picked != nil) {
            if let picked {
                Button {
                    picked.wrappedValue.append(exercise)
                    dismiss()
                } label: {
                    Label(pickedCount == 0 ? "Add to workout" : "Add again (\(pickedCount + 1)×)", systemImage: "plus")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
        }
        .fullScreenCover(isPresented: $showSheet) {
            CreateExerciseView(exercise: exercise, editMode: true, deletedExercise: $deletedExercise)
        }
        .onChange(of: deletedExercise) {
            dismiss()
        }
    }

    /// The other names of the exercise, which the search finds it by as well
    private var aliases: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Also known as")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            FlowLayout(spacing: 6) {
                ForEach(exercise.aliases, id: \.self) { alias in
                    Text(alias)
                        .font(.subheadline)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Also known as \(exercise.aliases.joined(separator: ", "))")
    }

    private var images: some View {
        ExerciseImagesView(images: imageItems) {
            VStack(spacing: 8) {
                Image(systemName: "photo")
                    .font(.largeTitle)
                Text("No images yet")
                    .font(.subheadline)
            }
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.tertiarySystemFill))
        }
        .aspectRatio(imageItems.isEmpty ? 2 : 1, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(alignment: .topLeading) {
            // the images of verified exercises are generated
            if exercise.verified && !imageItems.isEmpty {
                AIImageTag()
                    .padding(10)
            }
        }
        .padding(.top, 8)
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }

    // e.g. one per keyframe of the movement, the pending ones after the uploaded ones
    var imageItems: [ExerciseImageItem] {
        ExerciseImageItem.items(
            imageUrls: exercise.imageUrls,
            pendingImages: exercise.pendingImages.enumerated().map { (id: "pending-\($0.offset)", data: $0.element) }
        )
    }
}

/// Marks the images of verified exercises as generated by an AI, with the full note in a popover when it's tapped
private struct AIImageTag: View {

    @State private var showsNote = false

    private static let note = "The form isn't necessarily completely correct. It's only here to give you a general idea of the movement."

    var body: some View {
        Button {
            showsNote = true
        } label: {
            Label("AI image", systemImage: "sparkles")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.black.opacity(0.55), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("AI-generated image. \(Self.note)")
        .popover(isPresented: $showsNote, arrowEdge: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Label("AI-generated image", systemImage: "sparkles")
                    .font(.headline)
                Text(Self.note)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding()
            .frame(width: 280, alignment: .leading)
            .presentationCompactAdaptation(.popover)
        }
    }
}
