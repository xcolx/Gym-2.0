//
//  HighlightedBodyView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 25.08.2024.
//

import SwiftUI
import ImageIO

// The body with the primary muscles in red and the secondary muscles in orange.
// The images of the muscles come from the server. Each shows the outline of the body with the muscle in color, on a
// white background since the server stores JPEGs. Only the colored part is drawn, under the outline of the app.
struct HighlightedBodyView: View {

    let primaryMuscles: [Muscle]
    let secondaryMuscles: [Muscle]
    /// Shown alone instead of the other muscles, slowly pulsing in this color, e.g. to show where a muscle is
    var focusedMuscle: (muscle: Muscle, color: Color)? = nil

    @Environment(\.colorScheme) var colorScheme

    private var outline: Image {
        Image(colorScheme == .light ? "Highlighted_body_black" : "Highlighted_body_white")
    }

    var body: some View {

        ZStack{
            if let focusedMuscle {
                MuscleHighlightView(hash: focusedMuscle.muscle.imageUrl, color: focusedMuscle.color, outline: outline)
                    .phaseAnimator([1.0, 0.25]) { content, opacity in
                        content.opacity(opacity)
                    } animation: { _ in
                        .easeInOut(duration: 1.1)
                    }
                    // starts pulsing again from fully visible for another muscle
                    .id(focusedMuscle.muscle.persistentModelID)
            } else {
                ForEach(secondaryMuscles) {muscle in
                    MuscleHighlightView(hash: muscle.imageUrl, color: Color.orange, outline: outline)
                }

                ForEach(primaryMuscles) {muscle in
                    MuscleHighlightView(hash: muscle.imageUrl, color: Color(red: 1, green: 0, blue: 0), outline: outline)
                }
            }

            outline
                .resizable()
                .scaledToFit()
        }
    }
}

// The colored part of the image of a muscle, invisible while it loads
private struct MuscleHighlightView: View {

    let hash: String
    let color: Color
    // takes the place of the muscle while it loads, so the size of the body doesn't change
    let outline: Image

    @Environment(\.imageService) private var imageService
    @State private var mask: UIImage?

    var body: some View {
        // The store is checked directly, so that a muscle that was shown or preloaded before appears right away
        Group {
            if let mask = mask ?? MuscleMasks.mask(for: hash) {
                Image(uiImage: mask)
                    .resizable()
                    .renderingMode(.template)
                    .scaledToFit()
                    .foregroundStyle(color)
            } else {
                outline
                    .resizable()
                    .scaledToFit()
                    .hidden()
            }
        }
        .task(id: hash) {
            if let stored = MuscleMasks.mask(for: hash) {
                mask = stored
                return
            }
            mask = nil
            guard let imageService else { return }
            mask = await MuscleMasks.load(hash: hash, imageService: imageService)
        }
    }
}

/// The masks of the muscle images by hash. There are only a few muscles and their images never change under their
/// hash, so every mask is made once: kept in memory for the whole launch and saved to disk for the next ones.
/// `preload` makes them all at launch, so that a body is shown with its muscles right away.
@MainActor
enum MuscleMasks {

    // sharp at the largest highlighted body in the app (about 300 points high at 3x)
    private static let maxPixelSize: CGFloat = 500
    // JPEG compression gives the white and black parts of the image a little color
    private static let minChroma = 24

    // A new folder when the way a mask is made changes, the old one is removed
    private static let directoryName = "MuscleMasks-v1-500"
    private static let directory = URL.cachesDirectory.appending(path: directoryName, directoryHint: .isDirectory)

    private static var masks: [String: UIImage] = [:]
    /// Loads that are running, so a mask several bodies show at once is made once
    private static var loading: [String: Task<UIImage?, Never>] = [:]

    static func mask(for hash: String) -> UIImage? {
        masks[hash]
    }

    /// The mask from memory, from disk, or made from the image of the muscle. Nil if the image can't be loaded.
    static func load(hash: String, imageService: ImageService) async -> UIImage? {
        guard !hash.isEmpty else { return nil }
        if let mask = masks[hash] {
            return mask
        }
        if let task = loading[hash] {
            return await task.value
        }
        let task = Task<UIImage?, Never> {
            let file = directory.appending(path: "\(hash).png")
            if let stored = await Task.detached(priority: .userInitiated, operation: { readMask(file) }).value {
                return stored
            }
            guard let data = try? await imageService.imageData(hash: hash) else { return nil }
            return await Task.detached(priority: .userInitiated) {
                let mask = makeMask(data)
                if let mask {
                    writeMask(mask, to: file)
                }
                return mask
            }.value
        }
        loading[hash] = task
        let mask = await task.value
        loading[hash] = nil
        if let mask {
            masks[hash] = mask
        }
        return mask
    }

    /// Makes the masks of all muscles one after the other in the background and removes the ones of images that
    /// aren't used anymore
    static func preload(hashes: [String], imageService: ImageService) async {
        let hashes = Set(hashes.filter { !$0.isEmpty })
        await Task.detached(priority: .utility) {
            removeUnused(keeping: hashes)
        }.value
        for hash in hashes where masks[hash] == nil {
            guard !Task.isCancelled else { return }
            _ = await load(hash: hash, imageService: imageService)
        }
    }

    // MARK: - Disk

    nonisolated private static func readMask(_ file: URL) -> UIImage? {
        guard let image = UIImage(contentsOfFile: file.path()) else { return nil }
        // decoded here instead of on the main thread when it's drawn the first time
        return (image.preparingForDisplay() ?? image).withRenderingMode(.alwaysTemplate)
    }

    nonisolated private static func writeMask(_ mask: UIImage, to file: URL) {
        guard let data = mask.pngData() else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
    }

    nonisolated private static func removeUnused(keeping hashes: Set<String>) {
        let fileManager = FileManager.default
        let caches = URL.cachesDirectory
        // the folders of earlier versions of the masks
        for folder in (try? fileManager.contentsOfDirectory(at: caches, includingPropertiesForKeys: nil)) ?? []
        where folder.lastPathComponent.hasPrefix("MuscleMasks") && folder.lastPathComponent != directoryName {
            try? fileManager.removeItem(at: folder)
        }
        for file in (try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        where !hashes.contains(file.deletingPathExtension().lastPathComponent) {
            try? fileManager.removeItem(at: file)
        }
    }

    // MARK: - Making a mask

    // Keeps the colored pixels: the opacity of a pixel is its chroma (largest minus smallest channel), so the white
    // background, the black outline and the gray edges between them become transparent
    nonisolated static func makeMask(_ data: Data) -> UIImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              let context = CGContext(
                data: nil,
                width: image.width,
                height: image.height,
                bitsPerComponent: 8,
                bytesPerRow: image.width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ),
              let pixels = context.data?.bindMemory(to: UInt8.self, capacity: image.width * image.height * 4)
        else { return nil }

        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))

        for offset in stride(from: 0, to: image.width * image.height * 4, by: 4) {
            let red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2]
            let chroma = Int(max(red, green, blue)) - Int(min(red, green, blue))
            let alpha = UInt8(clamping: max(chroma - minChroma, 0) * 255 / (255 - minChroma))
            // premultiplied white, the color is set when it's drawn
            pixels[offset] = alpha
            pixels[offset + 1] = alpha
            pixels[offset + 2] = alpha
            pixels[offset + 3] = alpha
        }

        return context.makeImage().map { UIImage(cgImage: $0).withRenderingMode(.alwaysTemplate) }
    }
}
