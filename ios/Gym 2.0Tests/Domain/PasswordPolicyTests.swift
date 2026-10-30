//
//  PasswordPolicyTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Mirrors web/src/lib/domain/password-policy.test.ts
//

import Testing
@testable import Gym_2_0

struct PasswordPolicyTests {

    @Test func needs8To50Characters() {
        #expect(PasswordPolicy.problem(with: "Ab1") == "At least 8 characters.")
        #expect(PasswordPolicy.problem(with: String(repeating: "a", count: 25) + String(repeating: "B", count: 25)) == nil)
        #expect(PasswordPolicy.problem(with: String(repeating: "a", count: 25) + String(repeating: "B", count: 26)) == "At most 50 characters.")
    }

    @Test func countsCodePointsLikeTheServer() {
        // 4 emoji are 8 UTF-16 units but only 4 unicode scalars
        #expect(PasswordPolicy.problem(with: "😀😀😀😀") == "At least 8 characters.")
        // A flag is 1 character but 2 unicode scalars: 4 flags are 8 scalars, the server accepts the length
        #expect(PasswordPolicy.problem(with: "🇨🇭🇨🇭🇨🇭🇨🇭")?.contains("at least two") == true)
    }

    @Test func needsAtLeastTwoKindsOfCharacters() {
        #expect(PasswordPolicy.problem(with: "abcdefgh")?.contains("at least two") == true)
        #expect(PasswordPolicy.problem(with: "12345678")?.contains("at least two") == true)
        #expect(PasswordPolicy.problem(with: "abcdefg1") == nil)
        #expect(PasswordPolicy.problem(with: "abcdefg!") == nil)
        #expect(PasswordPolicy.problem(with: "ABCDEFGh") == nil)
    }
}
