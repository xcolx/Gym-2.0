//
//  ProfileIconView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import SwiftUI

/// The square profile icon of a user in a circle with a border in the user's app color, or a placeholder
struct ProfileIconView: View {

    let hash: String
    let size: CGFloat
    /// The app color of the user as a hex code, the default color if nil
    let color: String?
    /// The full profile image, opened in the photo viewer when the icon is tapped. Nil if it can't be opened.
    var imageHash: String? = nil

    var body: some View {
        ServerImageView(hash: hash.isEmpty ? nil : hash) {
            Image(systemName: "person.crop.circle.fill")
                .resizable()
                .foregroundStyle(.gray)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .profileBorder(color: color, size: size)
        .opensPhotoViewer(hash: imageHash)
    }
}

extension View {
    /// A border in the app color of the user (a hex code, the default color if nil) around a round profile image
    func profileBorder(color: String?, size: CGFloat) -> some View {
        let appColor = color.flatMap(Color.init(hex:)) ?? Color(hex: UserSettings.defaultColorHex)!
        return overlay(
            Circle().strokeBorder(appColor, lineWidth: max(2, size / 24))
        )
    }
}
