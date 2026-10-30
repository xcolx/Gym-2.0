//
//  UserSettings.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.05.2025.
//

import Foundation
import Observation
import SwiftData
import SwiftUI
import UIKit

/// The settings of the current user: bodyweight, units and app color.
///
/// They are stored on the current `User` in SwiftData, so they can be changed offline and are pushed by `UserSync`.
/// This class only mirrors them, so that views can observe them, and is reloaded after every save of the context.
///
/// Like the backend, SwiftData always stores kilograms and meters. Views convert with `UnitSystem` before they show
/// or store a value.
@MainActor
@Observable
final class UserSettings {

    static let defaultColorHex = "#FF0000"

    /// In kilograms. Nil until the user set it.
    private(set) var bodyweight: Double?
    private(set) var weightUnit: UnitSystem = .metric
    private(set) var distanceUnit: UnitSystem = .metric
    private(set) var schemeColor: String = defaultColorHex
    /// False until the first sync loaded the current user. The settings can't be changed before.
    private(set) var isAvailable = false

    var appColor: Color {
        Color(hex: schemeColor) ?? Color(hex: Self.defaultColorHex)!
    }

    /// Black or white, whichever is better readable on the app color
    var appColorForeground: Color {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(appColor).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let luminance = 0.299 * red + 0.587 * green + 0.114 * blue
        return luminance > 0.6 ? .black : .white
    }

    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private var saveObserver: NSObjectProtocol?

    init(context: ModelContext) {
        self.context = context
        reload()

        // Also the saves of the sync, e.g. after the settings were pulled from the server
        saveObserver = NotificationCenter.default.addObserver(forName: ModelContext.didSave, object: context, queue: nil) { [weak self] _ in
            Task { @MainActor in
                self?.reload()
            }
        }
    }

    // MARK: - Changing the settings

    /// In kilograms. Stored with one decimal, like on the server.
    func setBodyweight(_ kilograms: Double) {
        update { $0.bodyweight = (kilograms * 10).rounded() / 10 }
    }

    func setWeightUnit(_ unit: UnitSystem) {
        update { $0.weightUnit = unit.rawValue }
    }

    func setDistanceUnit(_ unit: UnitSystem) {
        update { $0.distanceUnit = unit.rawValue }
    }

    func setColor(_ color: Color) {
        update { $0.schemeColor = color.hexString }
    }

    /// Saves the change on the current user. The save starts a sync, which pushes it.
    private func update(_ change: (User) -> Void) {
        guard let user = currentUser() else { return }
        let before = user.profileUpdate
        change(user)
        guard user.profileUpdate != before else { return }
        user.syncState = .updated
        try? context.save()
        reload()
    }

    // MARK: - Loading

    private func reload() {
        let user = currentUser()
        assign(\.isAvailable, user != nil)
        assign(\.bodyweight, user?.bodyweight)
        assign(\.weightUnit, user?.weightUnit.flatMap(UnitSystem.init(rawValue:)) ?? .metric)
        assign(\.distanceUnit, user?.distanceUnit.flatMap(UnitSystem.init(rawValue:)) ?? .metric)
        assign(\.schemeColor, user?.schemeColor.flatMap { Color(hex: $0) == nil ? nil : $0 } ?? Self.defaultColorHex)
    }

    /// Only changed values are set, so that views don't update after every save
    private func assign<Value: Equatable>(_ keyPath: ReferenceWritableKeyPath<UserSettings, Value>, _ value: Value) {
        if self[keyPath: keyPath] != value {
            self[keyPath: keyPath] = value
        }
    }

    private func currentUser() -> User? {
        let descriptor = FetchDescriptor<User>(predicate: #Predicate { $0.isCurrentUser })
        return try? context.fetch(descriptor).first
    }
}

// MARK: - Hex colors

extension Color {
    /// From a hex code like "#FF0000"
    init?(hex: String) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = Int(digits, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    /// A hex code like "#FF0000", as the server stores it
    var hexString: String {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        // Extended sRGB colors can be outside of 0...1
        func byte(_ component: CGFloat) -> Int {
            Int((min(max(component, 0), 1) * 255).rounded())
        }
        return String(format: "#%02X%02X%02X", byte(red), byte(green), byte(blue))
    }
}
