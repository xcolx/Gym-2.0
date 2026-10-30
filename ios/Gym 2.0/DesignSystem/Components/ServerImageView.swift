//
//  ServerImageView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import SwiftUI
import ImageIO

extension EnvironmentValues {
    @Entry var imageService: ImageService? = nil
}

// Shows a stored image by the hash in its *_url field, or the placeholder while it loads or if there is none
struct ServerImageView<Placeholder: View>: View {

    let hash: String?
    var contentMode: ContentMode = .fit
    /// The longest side in pixels the image is decoded at, nil for the full size. Smaller images decode and draw
    /// faster, e.g. in lists that scroll.
    var maxPixelSize: CGFloat? = nil
    @ViewBuilder var placeholder: () -> Placeholder

    @Environment(\.imageService) private var imageService
    @State private var image: UIImage?

    private var cacheKey: String? {
        hash.map { DecodedImageCache.key(hash: $0, maxPixelSize: maxPixelSize) }
    }

    var body: some View {
        // The cache is checked directly, so that a cell that scrolls back into view doesn't show the placeholder first
        Group {
            if let image = image ?? cacheKey.flatMap(DecodedImageCache.image(for:)) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                placeholder()
            }
        }
        .task(id: cacheKey) {
            guard let hash, let cacheKey else {
                image = nil
                return
            }
            if let cached = DecodedImageCache.image(for: cacheKey) {
                image = cached
                return
            }
            image = nil
            guard let data = try? await imageService?.imageData(hash: hash) else { return }
            image = await DecodedImageCache.decode(data, key: cacheKey, maxPixelSize: maxPixelSize)
        }
    }
}

/// Decoded images by hash and size. Decoding a JPEG on the main thread while scrolling makes the scrolling stutter,
/// so images are decoded (and scaled down) in the background once and kept decoded.
enum DecodedImageCache {

    private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.totalCostLimit = 100 * 1024 * 1024
        return cache
    }()

    static func key(hash: String, maxPixelSize: CGFloat?) -> String {
        "\(hash)@\(maxPixelSize.map { Int($0) } ?? 0)"
    }

    static func image(for key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    static func decode(_ data: Data, key: String, maxPixelSize: CGFloat?) async -> UIImage? {
        let image = await Task.detached(priority: .userInitiated) {
            decode(data, maxPixelSize: maxPixelSize)
        }.value
        if let image {
            let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
            cache.setObject(image, forKey: key as NSString, cost: cost)
        }
        return image
    }

    /// Decodes the image right away (instead of when it's first drawn), upright and at most maxPixelSize large
    private static func decode(_ data: Data, maxPixelSize: CGFloat?) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else {
            return nil
        }
        var options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true
        ]
        if let maxPixelSize {
            options[kCGImageSourceThumbnailMaxPixelSize] = maxPixelSize
        } else if let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                  let width = properties[kCGImagePropertyPixelWidth] as? CGFloat,
                  let height = properties[kCGImagePropertyPixelHeight] as? CGFloat {
            options[kCGImageSourceThumbnailMaxPixelSize] = max(width, height)
        }
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
