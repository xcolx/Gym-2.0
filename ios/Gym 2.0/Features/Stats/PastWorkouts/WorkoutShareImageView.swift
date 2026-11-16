//
//  WorkoutShareImageView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.11.2026.
//

import SwiftUI

/// The image the share button of a past workout shares: the logo, the body with the totals of the workout and its
/// first exercises. Never shown on screen, `render` draws it as a 2:3 image.
/// The web app draws the same image on a canvas (web/src/components/stats/workout-share-image.ts): keep the sizes
/// the same.
struct WorkoutShareImageView: View {

    // 2:3, drawn at 2x
    static let size = CGSize(width: 800, height: 1200)
    static let scale: CGFloat = 2

    private static let padding: CGFloat = 36
    private static let cardPadding: CGFloat = 24
    private static let summaryColumns = 2
    private static let summaryRows = 4

    let content: WorkoutShareImageContent
    let primaryMuscles: [Muscle]
    let secondaryMuscles: [Muscle]

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .frame(height: 44)

            Text(content.name)
                .font(.system(size: 40, weight: .bold))
                .lineLimit(1)
                .frame(height: 48)
                .padding(.top, 18)

            overview
                .frame(height: 304)
                .padding(.top, 14)

            if !content.columns.isEmpty {
                exerciseList
                    .padding(.top, 16)
            }

            // The indicator that the workout had more exercises
            Text(content.moreExercisesText ?? "")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(.horizontal, Self.padding)
        .padding(.top, 32)
        .frame(width: Self.size.width, height: Self.size.height, alignment: .top)
        .background(Color(.systemGroupedBackground))
    }

    // Like `cardBackground()`, but only the card has a shadow: an image renderer would give one to the texts too
    private var card: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(Color(.secondarySystemGroupedBackground))
            .shadow(color: .black.opacity(colorScheme == .dark ? 0 : 0.06), radius: 10, y: 4)
    }

    // The logo in the top left corner, the date on the right
    private var header: some View {
        HStack(spacing: 12) {
            let shape = RoundedRectangle(cornerRadius: 11, style: .continuous)
            Image("Icon_image")
                .resizable()
                .scaledToFit()
                .frame(width: 44, height: 44)
                .clipShape(shape)
                // the black icon would disappear on the dark background without its edge
                .overlay(shape.strokeBorder(.white.opacity(colorScheme == .dark ? 0.2 : 0), lineWidth: 1))
            Text("Gym 2.0")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .fixedSize()
            Spacer(minLength: 40)
            Text(content.date)
                .font(.system(size: 19))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    // The body with the totals of the workout next to it
    private var overview: some View {
        HStack(alignment: .center, spacing: 40) {
            HighlightedBodyView(primaryMuscles: primaryMuscles, secondaryMuscles: secondaryMuscles)
                .frame(height: 256)
            Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                let lines = Array(content.lines.prefix(Self.summaryRows * Self.summaryColumns))
                ForEach(0..<Self.summaryRows, id: \.self) { row in
                    GridRow {
                        ForEach(0..<Self.summaryColumns, id: \.self) { column in
                            let index = row * Self.summaryColumns + column
                            Group {
                                if index < lines.count {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(lines[index].title)
                                            .font(.system(size: 18))
                                            .foregroundStyle(.secondary)
                                        Text(lines[index].value)
                                            .font(.system(size: 32, weight: .semibold, design: .rounded))
                                            .minimumScaleFactor(0.6)
                                    }
                                    .lineLimit(1)
                                    .padding(.trailing, 16)
                                } else {
                                    Color.clear
                                }
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
        .padding(Self.cardPadding)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(card)
    }

    // The exercises with their sets, column by column
    private var exerciseList: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(content.columns.enumerated()), id: \.offset) { _, column in
                VStack(alignment: .leading, spacing: WorkoutShareImageContent.gap) {
                    ForEach(column, id: \.number) { exercise in
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(spacing: 0) {
                                Text("\(exercise.number)")
                                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                                    .foregroundStyle(.secondary)
                                    .frame(width: 32, alignment: .leading)
                                Text(exercise.name)
                                    .font(.system(size: 20, weight: .semibold))
                            }
                            .frame(height: WorkoutShareImageContent.nameHeight)
                            ForEach(Array(exercise.lines.enumerated()), id: \.offset) { _, line in
                                Text(line)
                                    .font(.system(size: 16))
                                    .foregroundStyle(.secondary)
                                    .frame(height: WorkoutShareImageContent.lineHeight)
                                    .padding(.leading, 32)
                            }
                        }
                        .lineLimit(1)
                        .padding(.trailing, 16)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
        .padding(.horizontal, Self.cardPadding)
        .padding(.vertical, 16)
        .background(card)
    }

    /// The image of the workout in the appearance of the app. The masks of the muscles are loaded first, since an
    /// image renderer doesn't wait for the tasks of the views it draws.
    static func render(
        content: WorkoutShareImageContent,
        musclesTrained: ([Muscle], [Muscle]),
        colorScheme: ColorScheme,
        imageService: ImageService?
    ) async -> UIImage? {
        if let imageService {
            for muscle in musclesTrained.0 + musclesTrained.1 {
                _ = await MuscleMasks.load(hash: muscle.imageUrl, imageService: imageService)
            }
        }
        let view = WorkoutShareImageView(content: content, primaryMuscles: musclesTrained.0, secondaryMuscles: musclesTrained.1)
            .environment(\.colorScheme, colorScheme)
        let renderer = ImageRenderer(content: view)
        renderer.scale = scale
        renderer.proposedSize = ProposedViewSize(size)
        renderer.isOpaque = true
        return renderer.uiImage
    }

    /// The image as a PNG file in the temporary directory, named after the workout. Nil if it couldn't be made.
    static func renderFile(
        content: WorkoutShareImageContent,
        musclesTrained: ([Muscle], [Muscle]),
        colorScheme: ColorScheme,
        imageService: ImageService?
    ) async -> URL? {
        guard let image = await render(content: content, musclesTrained: musclesTrained, colorScheme: colorScheme, imageService: imageService),
              let data = image.pngData()
        else { return nil }
        // A folder of its own, so that workouts with the same name don't share a file
        let folder = URL.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let file = folder.appending(path: content.fileName)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: file, options: .atomic)
            return file
        } catch {
            return nil
        }
    }
}
