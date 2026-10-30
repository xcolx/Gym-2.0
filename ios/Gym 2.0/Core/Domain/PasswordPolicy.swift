//
//  PasswordPolicy.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import Foundation

/// The password rules of the backend (backend/app/core/security.py): 8 to 50 characters with at least two of
/// lowercase letters, uppercase letters, digits and special characters
enum PasswordPolicy {

    /// What the server would refuse about a new password, nil if it's fine
    static func problem(with password: String) -> String? {
        // The server counts unicode scalars
        let length = password.unicodeScalars.count
        if length < 8 { return "At least 8 characters." }
        if length > 50 { return "At most 50 characters." }
        let kinds = [
            password.contains(where: \.isLowercase),
            password.contains(where: \.isUppercase),
            password.contains(where: { $0.isASCII && $0.isNumber }),
            password.contains(where: { !$0.isLetter && !$0.isNumber })
        ].filter { $0 }.count
        if kinds < 2 { return "Use at least two of: lowercase letters, uppercase letters, digits, special characters." }
        return nil
    }
}
