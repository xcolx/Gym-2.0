//
//  PhotoViewer.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI

extension View {
    /// Opens the image with the hash in the full screen photo viewer when tapped. Does nothing if there is no image.
    func opensPhotoViewer(hash: String?) -> some View {
        modifier(OpensPhotoViewer(hash: hash))
    }
}

private struct OpensPhotoViewer: ViewModifier {

    let hash: String?
    @State private var isShown = false

    func body(content: Content) -> some View {
        if let hash, !hash.isEmpty {
            // Borderless, so that it's tappable on its own in list rows
            Button {
                isShown = true
            } label: {
                content
            }
            .buttonStyle(.borderless)
            .fullScreenCover(isPresented: $isShown) {
                PhotoViewer(hash: hash)
            }
        } else {
            content
        }
    }
}

/// A photo in full screen, zoomable with a pinch or a double tap
struct PhotoViewer: View {

    let hash: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.imageService) private var imageService
    @State private var image: UIImage?

    var body: some View {
        NavigationStack {
            Group {
                if let image {
                    ZoomableImageView(image: image)
                } else {
                    ProgressView()
                        .tint(.white)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.black)
            .ignoresSafeArea(edges: .bottom)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .toolbarBackground(.black, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .task {
            guard let data = try? await imageService?.imageData(hash: hash) else { return }
            image = await DecodedImageCache.decode(data, key: DecodedImageCache.key(hash: hash, maxPixelSize: nil), maxPixelSize: nil)
        }
    }
}

/// A UIScrollView, since it zooms and pans more naturally than SwiftUI gestures
private struct ZoomableImageView: UIViewRepresentable {

    let image: UIImage

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UIScrollView {
        let scrollView = CenteringScrollView()
        scrollView.delegate = context.coordinator
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 5
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.backgroundColor = .black

        let imageView = UIImageView(image: image)
        imageView.contentMode = .scaleAspectFit
        scrollView.addSubview(imageView)
        scrollView.imageView = imageView
        context.coordinator.imageView = imageView

        let doubleTap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTapped(_:)))
        doubleTap.numberOfTapsRequired = 2
        scrollView.addGestureRecognizer(doubleTap)
        return scrollView
    }

    func updateUIView(_ scrollView: UIScrollView, context: Context) {
        context.coordinator.imageView?.image = image
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        weak var imageView: UIImageView?

        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            imageView
        }

        @objc func doubleTapped(_ recognizer: UITapGestureRecognizer) {
            guard let scrollView = recognizer.view as? UIScrollView, let imageView else { return }
            if scrollView.zoomScale > scrollView.minimumZoomScale {
                scrollView.setZoomScale(scrollView.minimumZoomScale, animated: true)
            } else {
                // zooms in around the tapped point
                let point = recognizer.location(in: imageView)
                let scale = min(scrollView.maximumZoomScale, 3)
                let size = CGSize(width: scrollView.bounds.width / scale, height: scrollView.bounds.height / scale)
                scrollView.zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height), animated: true)
            }
        }
    }

    /// Fits the image into the bounds at zoom scale 1 and keeps it centered while it's smaller than the bounds
    final class CenteringScrollView: UIScrollView {
        weak var imageView: UIImageView?
        private var lastBoundsSize: CGSize = .zero

        override func layoutSubviews() {
            super.layoutSubviews()
            guard let imageView, let image = imageView.image, bounds.width > 0, bounds.height > 0 else { return }

            if bounds.size != lastBoundsSize {
                lastBoundsSize = bounds.size
                zoomScale = 1
                let fit = min(bounds.width / image.size.width, bounds.height / image.size.height)
                imageView.frame = CGRect(x: 0, y: 0, width: image.size.width * fit, height: image.size.height * fit)
                contentSize = imageView.frame.size
            }

            let x = max(0, (bounds.width - contentSize.width) / 2)
            let y = max(0, (bounds.height - contentSize.height) / 2)
            contentInset = UIEdgeInsets(top: y, left: x, bottom: y, right: x)
        }
    }
}
