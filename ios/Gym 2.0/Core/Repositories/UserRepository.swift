//
//  UserRepository.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import SwiftData

/// The current user, the friends, the blocked users and the other members of the chats
@MainActor
struct UserRepository: Repository {

    let context: ModelContext

    /// The stored user with this server ID, nil if there is none or it couldn't be fetched
    func user(serverId: Int) -> User? {
        try? context.fetch(FetchDescriptor<User>(predicate: #Predicate { $0.serverId == serverId })).first
    }

    /// The stored user of the profile, inserted if there is none yet
    func user(for dto: UserDTO) -> User {
        if let user = user(serverId: dto.id) {
            return user
        }
        let user = User(dto)
        context.insert(user)
        return user
    }
}
