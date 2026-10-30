//
//  Units.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import Foundation

// The backend and SwiftData always store kilograms and meters. These convert to and from the unit the user picked,
// right before a value is shown or after it was entered.
extension UnitSystem {

    static let kilogramsPerPound = 0.45359237
    static let metersPerFoot = 0.3048
    static let feetPerMile = 5280.0

    var weightSymbol: String {
        self == .metric ? "kg" : "lbs"
    }

    var distanceSymbol: String {
        self == .metric ? "m" : "ft"
    }

    func weight(fromKilograms kilograms: Double) -> Double {
        self == .metric ? kilograms : kilograms / Self.kilogramsPerPound
    }

    func kilograms(fromWeight weight: Double) -> Double {
        self == .metric ? weight : weight * Self.kilogramsPerPound
    }

    func distance(fromMeters meters: Double) -> Double {
        self == .metric ? meters : meters / Self.metersPerFoot
    }

    func meters(fromDistance distance: Double) -> Double {
        self == .metric ? distance : distance * Self.metersPerFoot
    }

    // MARK: - Formatting

    /// e.g. "50.0 kg"
    func formatWeight(kilograms: Double) -> String {
        String(format: "%.1f", weight(fromKilograms: kilograms)) + " " + weightSymbol
    }

    /// e.g. "400 m" or "1312.3 ft", from 1 km or 1 mile upwards "42.2 km" or "26.2 mi"
    func formatDistance(meters: Double) -> String {
        let value = distance(fromMeters: meters)
        switch self {
        case .metric where value >= 1000:
            return Self.number(value / 1000, maxDecimals: 2) + " km"
        case .imperial where value >= Self.feetPerMile:
            return Self.number(value / Self.feetPerMile, maxDecimals: 2) + " mi"
        default:
            return Self.number(value, maxDecimals: 1) + " " + distanceSymbol
        }
    }

    /// A sum of reps x weight, shortened with k and M, e.g. "12.5k kg"
    func formatVolume(kilograms: Double) -> String {
        let volume = weight(fromKilograms: kilograms)
        let text: String
        if volume < 1000 {
            text = String(format: "%.0f", volume)
        } else if volume < 1000000 {
            text = String(format: "%.1f", volume / 1000) + "k"
        } else {
            text = String(format: "%.2f", volume / 1000000) + "M"
        }
        return text + " " + weightSymbol
    }

    /// For input fields: at most `maxDecimals` decimals without trailing zeros, e.g. "80" or "80.5"
    static func number(_ value: Double, maxDecimals: Int) -> String {
        var text = String(format: "%.\(maxDecimals)f", value)
        if text.contains(".") {
            while text.hasSuffix("0") { text.removeLast() }
            if text.hasSuffix(".") { text.removeLast() }
        }
        return text
    }
}
