//
//  ProfileBannerView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI
import SwiftData

/// Profile image, username and account creation date of the current user, as loaded by the sync
struct ProfileBannerView: View {

    @Environment(UserSettings.self) var userSettings

    @Query(filter: #Predicate<User> { $0.isCurrentUser }) private var currentUsers: [User]

    private var user: User? {
        currentUsers.first
    }

    var body: some View {
        HStack {
            ServerImageView(hash: user.flatMap { $0.profileImageUrl.isEmpty ? nil : $0.profileImageUrl }, contentMode: .fill) {
                Circle()
                    .fill(Color("MyBlack"))
                    .overlay(
                        Image(systemName: "person.fill")
                            .resizable()
                            .foregroundStyle(Color("MyWhite"))
                            .frame(width: 50, height: 50)
                    )
            }
            .frame(width: 80, height: 80)
            .clipShape(Circle())
            .profileBorder(color: userSettings.schemeColor, size: 80)
            .opensPhotoViewer(hash: user?.profileImageUrl)
            .padding(.vertical, 15)
            .padding(.leading, 15)
            .padding(.trailing, 5)

            VStack(alignment: .leading) {
                // Empty until the first sync loaded the user
                Text(user?.username ?? " ")
                    .font(.largeTitle)

                if let createdAt = user?.createdAt {
                    Text("Tracking with Gym 2.0 since: \(formatDate(date: createdAt))")
                        .foregroundStyle(Color("MyGray"))
                        .font(.footnote)
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.bottom, 10)
        .background(userSettings.appColor.opacity(0.5).ignoresSafeArea())
    }
}
