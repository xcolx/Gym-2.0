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

    @Environment(\.colorScheme) var colorScheme

    private var outline: Image {
        Image(colorScheme == .light ? "Highlighted_body_black" : "Highlighted_body_white")
    }

    var body: some View {

        ZStack{
            ForEach(secondaryMuscles) {muscle in
                MuscleHighlightView(hash: muscle.imageUrl, color: Color.orange, outline: outline)
            }

            ForEach(primaryMuscles) {muscle in
                MuscleHighlightView(hash: muscle.imageUrl, color: Color(red: 1, green: 0, blue: 0), outline: outline)
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
        // The cache is checked directly, so that a muscle that was shown before appears right away
        Group {
            if let mask = mask ?? MuscleMaskCache.mask(for: hash) {
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
            if let cached = MuscleMaskCache.mask(for: hash) {
                mask = cached
                return
            }
            mask = nil
            guard !hash.isEmpty, let data = try? await imageService?.imageData(hash: hash) else { return }
            mask = await MuscleMaskCache.makeMask(data, hash: hash)
        }
    }
}

// The masks of the muscle images by hash, made in the background once
private enum MuscleMaskCache {

    // large enough for the biggest highlighted body in the app
    private static let maxPixelSize: CGFloat = 800
    // JPEG compression gives the white and black parts of the image a little color
    private static let minChroma = 24

    private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.totalCostLimit = 50 * 1024 * 1024
        return cache
    }()

    static func mask(for hash: String) -> UIImage? {
        cache.object(forKey: hash as NSString)
    }

    static func makeMask(_ data: Data, hash: String) async -> UIImage? {
        let mask = await Task.detached(priority: .userInitiated) {
            makeMask(data)
        }.value
        if let mask {
            let cost = Int(mask.size.width * mask.size.height * 4)
            cache.setObject(mask, forKey: hash as NSString, cost: cost)
        }
        return mask
    }

    // Keeps the colored pixels: the opacity of a pixel is its chroma (largest minus smallest channel), so the white
    // background, the black outline and the gray edges between them become transparent
    private static func makeMask(_ data: Data) -> UIImage? {
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
