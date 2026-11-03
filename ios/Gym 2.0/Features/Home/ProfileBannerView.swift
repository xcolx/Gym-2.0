//
//  ProfileBannerView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI
import SwiftData

/// Profile image, username and account creation date of the current user, as loaded by the sync, centered on a header
/// in the app color
struct ProfileBannerView: View {

    @Environment(UserSettings.self) var userSettings

    @Query(filter: #Predicate<User> { $0.isCurrentUser }) private var currentUsers: [User]

    private var user: User? {
        currentUsers.first
    }

    var body: some View {
        VStack(spacing: 4) {
            ServerImageView(hash: user.flatMap { $0.profileImageUrl.isEmpty ? nil : $0.profileImageUrl }, contentMode: .fill) {
                Circle()
                    .fill(Color(.systemGray3))
                    .overlay(
                        Image(systemName: "person.fill")
                            .resizable()
                            .scaledToFit()
                            .foregroundStyle(.white)
                            .padding(24)
                    )
            }
            .frame(width: 96, height: 96)
            .clipShape(Circle())
            .profileBorder(color: userSettings.schemeColor, size: 96)
            .opensPhotoViewer(hash: user?.profileImageUrl)
            .padding(.bottom, 6)

            // Empty until the first sync loaded the user
            Text(user?.username ?? " ")
                .font(.title2.bold())
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            if let createdAt = user?.createdAt {
                Text("Training since \(createdAt.formatted(.dateTime.month(.wide).year()))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal)
        .padding(.top, 12)
        // room for the totals, which overlap the bottom of the header
        .padding(.bottom, 52)
        .background(alignment: .bottom) {
            LinearGradient(
                colors: [userSettings.appColor.opacity(0.45), userSettings.appColor.opacity(0.15)],
                startPoint: .top,
                endPoint: .bottom
            )
            // reaches up behind the status bar, also when the header is pulled down
            .padding(.top, -1000)
        }
    }
}
