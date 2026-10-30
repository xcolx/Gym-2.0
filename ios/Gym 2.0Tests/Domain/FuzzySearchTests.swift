//
//  FuzzySearchTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Mirrors web/src/lib/domain/fuzzy-search.test.ts
//

import Testing
@testable import Gym_2_0

struct FuzzySearchTests {

    let names = [
        "Bench Press",
        "Incline Bench Press",
        "Overhead Press",
        "Barbell Shoulder Press",
        "Leg Press",
        "Lat Pulldown",
        "Crêpe Curl",
    ]

    func search(_ query: String) -> [String] {
        FuzzySearch.filter(names, query: query) { [$0] }
    }

    // MARK: score

    @Test func matchesExactlyByPrefixAndContained() {
        #expect(FuzzySearch.score("bench", in: "Bench Press") != nil)
        #expect(FuzzySearch.score("pres", in: "Bench Press") != nil)
        #expect(FuzzySearch.score("ench", in: "Bench Press") != nil)
    }

    @Test func toleratesTyposAndMissingLetters() {
        #expect(FuzzySearch.score("bnch", in: "Bench Press") != nil)
        #expect(FuzzySearch.score("bnech", in: "Bench Press") != nil)
        #expect(FuzzySearch.score("benchpress", in: "Bench Press") != nil)
        #expect(FuzzySearch.score("bnchprs", in: "Bench Press") != nil)
    }

    @Test func matchesAbbreviationsThatStartLikeAWord() {
        #expect(FuzzySearch.score("ohp", in: "Overhead Press") != nil)
        #expect(FuzzySearch.score("hpo", in: "Overhead Press") == nil)
    }

    @Test func needsEveryWordOfTheQueryToMatch() {
        #expect(FuzzySearch.score("bench squat", in: "Bench Press") == nil)
        #expect(FuzzySearch.score("", in: "Bench Press") == nil)
        #expect(FuzzySearch.score("  ,. ", in: "Bench Press") == nil)
    }

    @Test func ignoresCaseAndDiacritics() {
        #expect(FuzzySearch.score("CREPE", in: "Crêpe Curl") != nil)
        #expect(FuzzySearch.score("crêpe", in: "Crepe Curl") != nil)
    }

    // MARK: filter

    @Test func ranksNamesWithFewerExtraWordsHigher() {
        #expect(search("bench press") == ["Bench Press", "Incline Bench Press"])
    }

    @Test func ranksEquallyGoodMatchesByName() {
        #expect(search("press") == [
            "Bench Press",
            "Leg Press",
            "Overhead Press",
            "Barbell Shoulder Press",
            "Incline Bench Press",
        ])
    }

    @Test func ranksExactWordsAbovePrefixes() throws {
        #expect(search("lat") == ["Lat Pulldown"])
        let word = try #require(FuzzySearch.score("leg", in: "Leg Press"))
        let prefix = try #require(FuzzySearch.score("le", in: "Leg Press"))
        #expect(word > prefix)
    }

    @Test func findsItemsByTheirOtherNamesBelowAnEquallyGoodMatchOfTheShownName() {
        struct Item { let name: String; let aliases: [String] }
        let exercises = [
            Item(name: "Barbell Shoulder Press", aliases: ["Military Press"]),
            Item(name: "Military Press", aliases: []),
            Item(name: "Leg Press", aliases: []),
        ]
        let result = FuzzySearch.filter(exercises, query: "military press") { [$0.name] + $0.aliases }.map(\.name)
        #expect(result == ["Military Press", "Barbell Shoulder Press"])
    }

    @Test func leavesOutItemsWithoutNames() {
        #expect(FuzzySearch.filter([[String](), ["Leg Press"]], query: "leg") { $0 } == [["Leg Press"]])
    }
}
