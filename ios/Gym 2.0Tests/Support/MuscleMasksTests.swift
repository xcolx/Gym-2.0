//
//  MuscleMasksTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 05.11.2026.
//
//  DesignSystem/Components/HighlightedBodyView.swift
//

import Foundation
import Testing
import UIKit
@testable import Gym_2_0

struct MuscleMasksTests {

    /// Like the image of a muscle from the server: a white JPEG with the black outline of the body and the muscle in
    /// red, here a black frame with a red square in the middle
    private func muscleImage(width: Int = 1000, height: Int = 1200) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            UIColor.black.setStroke()
            context.cgContext.setLineWidth(20)
            context.cgContext.stroke(CGRect(x: 50, y: 50, width: width - 100, height: height - 100))
            UIColor.red.setFill()
            context.fill(CGRect(x: width / 2 - 100, y: height / 2 - 100, width: 200, height: 200))
        }
        return image.jpegData(compressionQuality: 0.8)!
    }

    /// The opacity of the pixel at the relative position, from 0 to 255
    private func alpha(of image: UIImage, atX x: Double, y: Double) -> UInt8 {
        let cgImage = image.cgImage!
        var pixel = [UInt8](repeating: 0, count: 4)
        let context = CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let px = Int(x * Double(cgImage.width)), py = Int(y * Double(cgImage.height))
        context.draw(cgImage, in: CGRect(x: -px, y: py - cgImage.height + 1, width: cgImage.width, height: cgImage.height))
        return pixel[3]
    }

    @Test func keepsOnlyTheColoredMuscle() throws {
        let mask = try #require(MuscleMasks.makeMask(muscleImage()))
        #expect(alpha(of: mask, atX: 0.5, y: 0.5) > 200)
        // the white background and the black outline
        #expect(alpha(of: mask, atX: 0.2, y: 0.3) == 0)
        #expect(alpha(of: mask, atX: 0.05, y: 0.5) == 0)
    }

    @Test func isSmallerThanTheImage() throws {
        let start = Date.now
        let mask = try #require(MuscleMasks.makeMask(muscleImage()))
        print("Making a mask took \(Int(Date.now.timeIntervalSince(start) * 1000)) ms")
        #expect(max(mask.size.width, mask.size.height) == 500)
        #expect(mask.renderingMode == .alwaysTemplate)
    }
}
