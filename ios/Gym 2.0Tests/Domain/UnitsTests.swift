//
//  UnitsTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Mirrors web/src/lib/domain/units.test.ts
//

import Testing
@testable import Gym_2_0

struct UnitsTests {

    @Test func convertsWeightsAndDistancesBothWays() {
        #expect(UnitSystem.metric.weight(fromKilograms: 100) == 100)
        #expect(abs(UnitSystem.imperial.weight(fromKilograms: 0.45359237) - 1) < 1e-9)
        #expect(abs(UnitSystem.imperial.kilograms(fromWeight: UnitSystem.imperial.weight(fromKilograms: 80)) - 80) < 1e-9)
        #expect(abs(UnitSystem.imperial.distance(fromMeters: 0.3048) - 1) < 1e-9)
        #expect(abs(UnitSystem.imperial.meters(fromDistance: UnitSystem.imperial.distance(fromMeters: 500)) - 500) < 1e-9)
        #expect(UnitSystem.metric.meters(fromDistance: 42) == 42)
    }

    @Test func hasTheSymbolsOfTheUnit() {
        #expect(UnitSystem.metric.weightSymbol == "kg")
        #expect(UnitSystem.imperial.weightSymbol == "lbs")
        #expect(UnitSystem.metric.distanceSymbol == "m")
        #expect(UnitSystem.imperial.distanceSymbol == "ft")
    }

    @Test func formatsWeightsWithOneDecimal() {
        #expect(UnitSystem.metric.formatWeight(kilograms: 50) == "50.0 kg")
        #expect(UnitSystem.imperial.formatWeight(kilograms: 100) == "220.5 lbs")
    }

    @Test func formatsDistancesFrom1KmOr1MileUpwardsInKmOrMi() {
        #expect(UnitSystem.metric.formatDistance(meters: 400) == "400 m")
        #expect(UnitSystem.metric.formatDistance(meters: 1500) == "1.5 km")
        #expect(UnitSystem.imperial.formatDistance(meters: 100) == "328.1 ft")
        #expect(UnitSystem.imperial.formatDistance(meters: 1609.344) == "1 mi")
    }

    @Test func shortensVolumesWithKAndM() {
        #expect(UnitSystem.metric.formatVolume(kilograms: 999) == "999 kg")
        #expect(UnitSystem.metric.formatVolume(kilograms: 12_500) == "12.5k kg")
        #expect(UnitSystem.metric.formatVolume(kilograms: 2_500_000) == "2.50M kg")
    }

    @Test func formatsNumbersWithoutTrailingZeros() {
        #expect(UnitSystem.number(80, maxDecimals: 1) == "80")
        #expect(UnitSystem.number(80.5, maxDecimals: 1) == "80.5")
        #expect(UnitSystem.number(1.5, maxDecimals: 2) == "1.5")
        #expect(UnitSystem.number(100, maxDecimals: 0) == "100")
    }

    /// The web shows "0" here (web/src/lib/domain/units.ts, formatNumber), the app "-0"
    @Test func formatsSmallNegativeNumbersAsZero() {
        withKnownIssue("UnitSystem.number shows \"-0\" for small negative values like -0.04, the web client \"0\"") {
            #expect(UnitSystem.number(-0.04, maxDecimals: 1) == "0")
        }
    }

    @Test func roundsExactTiesToTheEvenDigitLikePrintf() {
        #expect(UnitSystem.number(6.25, maxDecimals: 1) == "6.2")
        #expect(UnitSystem.number(6.75, maxDecimals: 1) == "6.8")
        #expect(UnitSystem.metric.formatWeight(kilograms: 22.25) == "22.2 kg")
        #expect(UnitSystem.metric.formatVolume(kilograms: 12_250) == "12.2k kg")
        #expect(UnitSystem.metric.formatVolume(kilograms: 2.5) == "2 kg")
    }
}
