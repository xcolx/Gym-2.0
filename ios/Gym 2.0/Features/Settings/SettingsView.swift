//
//  SettingsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI
import SwiftData

struct SettingsView: View {

    @Environment(UserSettings.self) var userSettings
    @AppStorage(AppTheme.storageKey) private var theme: AppTheme = .system

    @Query(filter: #Predicate<User> { $0.isCurrentUser }) private var currentUsers: [User]
    @Query(filter: #Predicate<User> { $0.isBlocked }) private var blockedUsers: [User]

    var body: some View {
        NavigationStack {
            Form {
                // Can only be changed once the first sync loaded the current user
                Group {
                    BodyweightSection()
                    unitsSection
                    appColorSection
                    blockedUsersSection
                }
                .disabled(!userSettings.isAvailable)
                // Only stored on the device, so it can always be changed
                appearanceSection
                if let user = currentUsers.first {
                    AccountSection(user: user)
                }
                ResyncSection()
                AboutDeveloperSection()
            }
            .navigationTitle("Settings")
        }
    }

    // MARK: - Units

    private var unitsSection: some View {
        Section {
            unitPicker("Weight", metric: "kg", imperial: "lbs", selection: Binding(get: { userSettings.weightUnit }, set: { userSettings.setWeightUnit($0) }))
            unitPicker("Distance", metric: "m", imperial: "ft", selection: Binding(get: { userSettings.distanceUnit }, set: { userSettings.setDistanceUnit($0) }))
        } header: {
            Text("Units")
        }
    }

    // A segmented picker hides its label in a form
    private func unitPicker(_ title: String, metric: String, imperial: String, selection: Binding<UnitSystem>) -> some View {
        LabeledContent(title) {
            Picker(title, selection: selection) {
                Text(metric).tag(UnitSystem.metric)
                Text(imperial).tag(UnitSystem.imperial)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 140)
        }
    }

    // MARK: - App color

    private var appColorSection: some View {
        Section {
            ColorPicker("App Color", selection: Binding(get: { userSettings.appColor }, set: { userSettings.setColor($0) }), supportsOpacity: false)
        }
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        Section {
            Picker("Appearance", selection: $theme) {
                ForEach(AppTheme.allCases) { theme in
                    Text(theme.title).tag(theme)
                }
            }
        }
    }

    // MARK: - Blocked users

    private var blockedUsersSection: some View {
        Section {
            NavigationLink {
                BlockedUsersView()
            } label: {
                LabeledContent("Blocked Users", value: "\(blockedUsers.count)")
            }
        }
    }
}

// MARK: - Bodyweight

private struct BodyweightSection: View {

    @Environment(UserSettings.self) var userSettings

    @State private var text = ""
    @FocusState private var isFocused: Bool

    private var unit: UnitSystem {
        userSettings.weightUnit
    }

    /// The entered number, also with a comma as the decimal separator (e.g. a German keyboard)
    private var value: Double? {
        Double(text.replacingOccurrences(of: ",", with: "."))
    }

    /// The server takes 0 < kg < 1000
    private var isValid: Bool {
        guard let value else { return text.isEmpty }
        let kilograms = unit.kilograms(fromWeight: value)
        return kilograms > 0 && kilograms < 1000
    }

    var body: some View {
        Section {
            HStack {
                Text("Bodyweight")
                Spacer()
                TextField("–", text: $text)
                    .focused($isFocused)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 80)
                    .foregroundStyle(isValid ? Color.primary : Color.red)
                Text(unit.weightSymbol)
                    .foregroundStyle(.secondary)
            }
        } footer: {
            if !isValid {
                Text("Enter a weight between 0 and \(UnitSystem.number(unit.weight(fromKilograms: 1000), maxDecimals: 0)) \(unit.weightSymbol).")
                    .foregroundStyle(.red)
            } else {
                Text("Used as the weight of bodyweight exercises.")
            }
        }
        .onAppear(perform: showStoredValue)
        .onChange(of: unit) { showStoredValue() }
        // e.g. pulled from the server, but not while the user is typing
        .onChange(of: userSettings.bodyweight) {
            if !isFocused { showStoredValue() }
        }
        .onChange(of: isFocused) {
            if !isFocused { showStoredValue() }
        }
        .onChange(of: text) {
            guard isFocused, isValid, let value else { return }
            userSettings.setBodyweight(unit.kilograms(fromWeight: value))
        }
    }

    private func showStoredValue() {
        text = userSettings.bodyweight.map { UnitSystem.number(unit.weight(fromKilograms: $0), maxDecimals: 1) } ?? ""
    }
}

// MARK: - Manual resync

private struct ResyncSection: View {

    @Environment(SyncService.self) private var syncService

    @State private var isResyncing = false
    @State private var didFinish = false

    var body: some View {
        Section {
            Button {
                Task {
                    isResyncing = true
                    didFinish = false
                    await syncService.resync()
                    isResyncing = false
                    didFinish = true
                }
            } label: {
                HStack {
                    Text("Manual Resync")
                    Spacer()
                    if isResyncing {
                        ProgressView()
                    }
                }
            }
            .disabled(isResyncing)

            // Only while something is out of sync
            if !syncService.problems.isEmpty {
                NavigationLink {
                    SyncProblemsView()
                } label: {
                    LabeledContent {
                        Text("\(syncService.problems.count)")
                            .foregroundStyle(.red)
                    } label: {
                        Label("Sync Problems", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
        } footer: {
            if didFinish, case .failed(let message) = syncService.state {
                Text("The resync failed: \(message)")
                    .foregroundStyle(.red)
            } else if didFinish {
                Text("Everything was reloaded from the server.")
            } else {
                Text("Uploads all changes that are not on the server yet and then loads everything again. Use it if something seems out of sync.")
            }
        }
    }
}

// MARK: - About the developer

private struct AboutDeveloperSection: View {

    private static let email = "gym2@colinrueegg.com"

    @Environment(\.openURL) private var openURL
    /// The link to open once the user confirmed leaving the app
    @State private var pendingURL: URL?

    var body: some View {
        Section {
            Button {
                pendingURL = URL(string: "https://github.com/xcolx")
            } label: {
                LabeledContent("GitHub", value: "xcolx")
            }
            Button {
                pendingURL = URL(string: "https://github.com/xcolx/Gym-2.0")
            } label: {
                LabeledContent("Source Code", value: "Gym-2.0")
            }
            Button {
                pendingURL = URL(string: "mailto:\(Self.email)")
            } label: {
                LabeledContent("Email", value: Self.email)
            }
            Button("Terms of Use") {
                pendingURL = URL(string: "https://gym2.app/tos")
            }
            Button("Privacy Policy") {
                pendingURL = URL(string: "https://gym2.app/privacy")
            }
        } header: {
            Text("About the Developer")
        } footer: {
            Text("Questions, feedback, bugs or suggestions? Send me an email.")
        }
        .font(.footnote)
        .alert("Leave Gym 2.0?", isPresented: Binding(get: { pendingURL != nil }, set: { if !$0 { pendingURL = nil } })) {
            Button("Yes") {
                if let pendingURL { openURL(pendingURL) }
            }
            .keyboardShortcut(.defaultAction)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Do you want to open this link and leave the app?")
        }
    }
}
