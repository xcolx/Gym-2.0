//
//  FuzzySearch.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import Foundation

/// Typo tolerant search over short names like exercise names.
///
/// The query is split into words, and every word has to match a word of the name, in any order:
/// exactly, as a prefix ("pres" → "Press"), contained ("ench"), with typos ("bnch" → "Bench"), or with missing
/// letters, also across words ("benchpress" or "bnchprs" → "Bench Press").
/// Case and diacritics are ignored.
enum FuzzySearch {

    /// Higher is better, nil if the name doesn't match
    static func score(_ query: String, in name: String) -> Double? {
        let queryWords = words(of: query)
        guard !queryWords.isEmpty else { return nil }
        let nameWords = words(of: name)
        let compactName = nameWords.joined()

        var total = 0.0
        for queryWord in queryWords {
            let best = nameWords.map { score(queryWord, word: $0) }.max() ?? 0
            var compact = 0.0
            if compactName.contains(queryWord) {
                compact = 2
            } else if queryWord.count >= 3 && nameWords.contains(where: { $0.first == queryWord.first }) && isSubsequence(queryWord, of: compactName) {
                // Like an abbreviation ("ohp" → "Overhead Press"), so it has to start like one of the words
                compact = 0.5
            }
            let wordScore = max(best, compact)
            guard wordScore > 0 else { return nil }
            total += wordScore
        }
        // Names with fewer extra words rank higher, e.g. "Bench Press" before "Incline Bench Press"
        return total - Double(max(nameWords.count - queryWords.count, 0)) * 0.1
    }

    /// A match of another name than the shown one ranks below an equally good match of the shown name
    private static let otherNamePenalty = 0.05

    /// The items of which one of the names matches, best match first. The first name is the shown one,
    /// the others are only searched, e.g. the aliases of an exercise ("Military Press" → "Barbell Shoulder Press").
    static func filter<Item>(_ items: [Item], query: String, names: (Item) -> [String]) -> [Item] {
        var matches: [(item: Item, score: Double, name: String)] = []
        for item in items {
            let itemNames = names(item)
            guard let shownName = itemNames.first else { continue }
            let best = itemNames.enumerated().compactMap { index, itemName in
                score(query, in: itemName).map { index == 0 ? $0 : $0 - otherNamePenalty }
            }.max()
            if let best {
                matches.append((item, best, shownName))
            }
        }
        matches.sort { first, second in
            if first.score != second.score { return first.score > second.score }
            return first.name.localizedCaseInsensitiveCompare(second.name) == .orderedAscending
        }
        return matches.map(\.item)
    }

    // MARK: - Matching one word

    private static func score(_ queryWord: String, word: String) -> Double {
        if word == queryWord { return 4 }
        if word.hasPrefix(queryWord) { return 3 }
        if word.contains(queryWord) { return 2 }

        // Typos: compared with the beginning of the word, so that "bnch" also matches "benches"
        let allowed = queryWord.count <= 3 ? 0 : queryWord.count <= 6 ? 1 : 2
        if allowed > 0 {
            let distance = (max(queryWord.count - 1, 1)...(queryWord.count + 1))
                .map { editDistance(queryWord, String(word.prefix($0))) }
                .min() ?? .max
            if distance <= allowed {
                return 1.5 - Double(distance) * 0.25
            }
        }

        if queryWord.count >= 3 && word.first == queryWord.first && isSubsequence(queryWord, of: word) { return 0.5 }
        return 0
    }

    private static func words(of text: String) -> [String] {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .lowercased()
            .split { !$0.isLetter && !$0.isNumber }
            .map(String.init)
    }

    /// All characters of `text` appear in `other` in the same order
    private static func isSubsequence(_ text: String, of other: String) -> Bool {
        var remaining = text[...]
        for character in other where remaining.first == character {
            remaining.removeFirst()
            if remaining.isEmpty { return true }
        }
        return remaining.isEmpty
    }

    /// Levenshtein distance, a swap of two neighbouring characters counts as one edit
    private static func editDistance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var previousPrevious = [Int](repeating: 0, count: b.count + 1)
        var previous = Array(0...b.count)
        var current = [Int](repeating: 0, count: b.count + 1)
        for i in 1...a.count {
            current[0] = i
            for j in 1...b.count {
                let cost = a[i - 1] == b[j - 1] ? 0 : 1
                current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
                if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                    current[j] = min(current[j], previousPrevious[j - 2] + 1)
                }
            }
            (previousPrevious, previous, current) = (previous, current, previousPrevious)
        }
        return previous[b.count]
    }
}
