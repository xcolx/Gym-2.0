//
//  ExerciseImagesView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.10.2026.
//

import SwiftUI
import UIKit

/// One image of an exercise: an uploaded one by its hash or a pending one that wasn't uploaded yet
enum ExerciseImageItem: Identifiable {
    case stored(hash: String)
    case pending(id: String, data: Data)

    var id: String {
        switch self {
        case .stored(let hash): hash
        case .pending(let id, _): id
        }
    }

    /// The uploaded images followed by the pending ones, the order in which they are shown and stored on the server
    static func items(imageUrls: [String], pendingImages: [(id: String, data: Data)]) -> [ExerciseImageItem] {
        imageUrls.map { .stored(hash: $0) } + pendingImages.map { .pending(id: $0.id, data: $0.data) }
    }
}

/// The images of an exercise as pages that are swiped horizontally, e.g. one per keyframe of the movement, with a dot
/// per page at the bottom while there is more than one. A swipe switches to the next page instantly, without scrolling,
/// so that swiping through the keyframes plays the movement like a flip book. The pages loop: after the last one comes
/// the first again. `trailing` is an additional last page (e.g. the picker that adds images), `onRemove` adds a button
/// to every image that removes it. Without pages the placeholder is shown.
///
/// All pages are stacked and only the shown one is visible, so the images are loaded before they are swiped to.
struct ExerciseImagesView<Placeholder: View, Trailing: View>: View {

    let images: [ExerciseImageItem]
    var showsTrailing: Bool = false
    var onRemove: ((Int) -> Void)? = nil
    @ViewBuilder var placeholder: () -> Placeholder
    @ViewBuilder var trailing: () -> Trailing

    /// How far a horizontal drag has to go to switch the page
    private static var swipeDistance: CGFloat { 30 }

    @State private var shownPage = 0

    private var pageCount: Int {
        images.count + (showsTrailing ? 1 : 0)
    }

    private var page: Int {
        min(shownPage, max(pageCount - 1, 0))
    }

    var body: some View {
        if pageCount == 0 {
            placeholder()
        } else if pageCount == 1 {
            pageView(0)
        } else {
            ZStack {
                ForEach(0..<pageCount, id: \.self) { index in
                    pageView(index)
                        .opacity(index == page ? 1 : 0)
                        .allowsHitTesting(index == page)
                        .accessibilityHidden(index != page)
                }
            }
            .contentShape(Rectangle())
            // simultaneous, so that a scroll view around it still scrolls vertically
            .simultaneousGesture(
                DragGesture(minimumDistance: 10)
                    .onEnded { value in
                        let width = value.translation.width
                        guard abs(width) >= Self.swipeDistance, abs(width) > abs(value.translation.height) else { return }
                        show(page + (width < 0 ? 1 : -1))
                    }
            )
            .overlay(alignment: .bottom) {
                pageDots
            }
            .accessibilityElement(children: .contain)
            .accessibilityScrollAction { edge in
                switch edge {
                case .trailing: show(page + 1)
                case .leading: show(page - 1)
                default: break
                }
            }
            // Keeps the shown page when pages are added or removed, added images are shown right away instead of the
            // page that adds them staying in place
            .onChange(of: [images.count, pageCount]) { old, new in
                shownPage = new[0] > old[0] ? old[0] : min(page, new[1] - 1)
            }
        }
    }

    /// The page, wrapping around at both ends
    private func show(_ index: Int) {
        shownPage = (index % pageCount + pageCount) % pageCount
    }

    @ViewBuilder
    private func pageView(_ index: Int) -> some View {
        if index < images.count {
            imageView(images[index])
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(alignment: .topTrailing) {
                    if let onRemove {
                        Button {
                            onRemove(index)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 30, height: 30)
                                .background(Color.black.opacity(0.6), in: Circle())
                        }
                        .padding(4)
                        .accessibilityLabel("Remove image \(index + 1)")
                    }
                }
        } else {
            trailing()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder
    private func imageView(_ image: ExerciseImageItem) -> some View {
        switch image {
        case .stored(let hash):
            ServerImageView(hash: hash, placeholder: placeholder)
        case .pending(_, let data):
            if let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
            } else {
                placeholder()
            }
        }
    }

    private var pageDots: some View {
        HStack(spacing: 6) {
            ForEach(0..<pageCount, id: \.self) { index in
                Circle()
                    .fill(Color.white)
                    .opacity(index == page ? 1 : 0.4)
                    .frame(width: 6, height: 6)
                    .shadow(color: .black.opacity(0.8), radius: 1)
                    .onTapGesture {
                        show(index)
                    }
            }
        }
        .padding(.bottom, 6)
        .accessibilityElement()
        .accessibilityLabel("Image \(page + 1) of \(pageCount)")
    }
}

extension ExerciseImagesView where Trailing == EmptyView {
    init(images: [ExerciseImageItem], @ViewBuilder placeholder: @escaping () -> Placeholder) {
        self.init(images: images, placeholder: placeholder, trailing: { EmptyView() })
    }
}

/// Picked photos as they are stored as pending images and uploaded
enum ExerciseImageUpload {

    /// The server stores exercise images with at most 1280 px per side (EXERCISE_IMAGE_MAX_DIMENSION). All images of an
    /// exercise are sent in one request, which the reverse proxy limits to 20 MiB, so they are scaled down beforehand.
    static let maxDimension: CGFloat = 1280

    /// A JPEG of at most 1280 px per side, nil if the data isn't an image
    static func prepared(_ data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let scale = min(1, maxDimension / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let scaled = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return scaled.jpegData(compressionQuality: 0.9)
    }
}
