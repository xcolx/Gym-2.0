//
//  ProfileImageCropView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import SwiftUI
import UIKit

/// Lets the user move and zoom the picked image inside a circle and returns the square part inside it.
/// The image always covers the whole circle.
struct ProfileImageCropView: View {

    let image: UIImage
    let onCancel: () -> Void
    let onChoose: (UIImage) -> Void

    private static let maxZoom: CGFloat = 4
    /// Side length of the cropped image, the server doesn't store larger profile images
    private static let outputSize: CGFloat = 1024

    @State private var zoom: CGFloat = 1
    @State private var lastZoom: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                let diameter = min(geometry.size.width, geometry.size.height) - 32
                let size = displayedSize(diameter: diameter, zoom: zoom)

                ZStack {
                    Image(uiImage: image)
                        .resizable()
                        .frame(width: size.width, height: size.height)
                        .offset(offset)

                    CircleCutout(diameter: diameter)
                        .fill(Color.black.opacity(0.6), style: FillStyle(eoFill: true))
                        .allowsHitTesting(false)
                    Circle()
                        .stroke(Color.white.opacity(0.8), lineWidth: 1)
                        .frame(width: diameter, height: diameter)
                        .allowsHitTesting(false)
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
                .clipped()
                .contentShape(Rectangle())
                .gesture(dragGesture(diameter: diameter).simultaneously(with: zoomGesture(diameter: diameter)))
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", action: onCancel)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Choose") {
                            if let cropped = crop(diameter: diameter) {
                                onChoose(cropped)
                            }
                        }
                    }
                }
            }
            .background(Color.black)
            .navigationTitle("Move and Scale")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }

    // MARK: - Gestures

    private func dragGesture(diameter: CGFloat) -> some Gesture {
        DragGesture()
            .onChanged { value in
                let proposed = CGSize(width: lastOffset.width + value.translation.width, height: lastOffset.height + value.translation.height)
                offset = clamped(proposed, diameter: diameter, zoom: zoom)
            }
            .onEnded { _ in
                lastOffset = offset
            }
    }

    private func zoomGesture(diameter: CGFloat) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                zoom = min(max(lastZoom * value.magnification, 1), Self.maxZoom)
                offset = clamped(offset, diameter: diameter, zoom: zoom)
            }
            .onEnded { _ in
                lastZoom = zoom
                lastOffset = offset
            }
    }

    // MARK: - Geometry

    /// At zoom 1 the shorter side of the image fills the circle
    private func displayedSize(diameter: CGFloat, zoom: CGFloat) -> CGSize {
        let fill = diameter / min(image.size.width, image.size.height)
        return CGSize(width: image.size.width * fill * zoom, height: image.size.height * fill * zoom)
    }

    /// So that the image never leaves a gap inside the circle
    private func clamped(_ offset: CGSize, diameter: CGFloat, zoom: CGFloat) -> CGSize {
        let size = displayedSize(diameter: diameter, zoom: zoom)
        let maxX = (size.width - diameter) / 2
        let maxY = (size.height - diameter) / 2
        return CGSize(width: min(max(offset.width, -maxX), maxX), height: min(max(offset.height, -maxY), maxY))
    }

    /// The square of the image behind the circle
    private func crop(diameter: CGFloat) -> UIImage? {
        let size = displayedSize(diameter: diameter, zoom: zoom)
        // Image points per displayed point
        let factor = image.size.width / size.width
        let rect = CGRect(
            x: ((size.width - diameter) / 2 - offset.width) * factor,
            y: ((size.height - diameter) / 2 - offset.height) * factor,
            width: diameter * factor,
            height: diameter * factor
        )

        let side = min(rect.width, Self.outputSize)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            // Draws the whole image shifted and scaled, so the orientation of the photo is respected
            let scale = side / rect.width
            image.draw(in: CGRect(x: -rect.minX * scale, y: -rect.minY * scale, width: image.size.width * scale, height: image.size.height * scale))
        }
    }
}

/// The whole rect with a circle in the middle, filled with eoFill to gray out everything but the circle
private struct CircleCutout: Shape {
    let diameter: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path(rect)
        path.addEllipse(in: CGRect(x: rect.midX - diameter / 2, y: rect.midY - diameter / 2, width: diameter, height: diameter))
        return path
    }
}
