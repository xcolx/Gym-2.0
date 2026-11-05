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
                if let user = currentUsers.first {
                    Section {
                        AccountProfileLink(user: user)
                    }
                }

                // Can only be changed once the first sync loaded the current user
                trainingSection
                    .disabled(!userSettings.isAvailable)
                appearanceSection
                privacySection
                    .disabled(!userSettings.isAvailable)

                AboutSection()

                if currentUsers.first != nil {
                    LogoutSection()
                }

                Section {
                } footer: {
                    Text("Gym 2.0 \(version)")
                        .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Settings")
        }
    }

    /// Like "3.0.2 (3)"
    private var version: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        return "\(version) (\(build))"
    }

    // MARK: - Training

    private var trainingSection: some View {
        Section {
            BodyweightRow()
            unitPicker("Weight", systemImage: "scalemass", metric: "kg", imperial: "lbs", selection: Binding(get: { userSettings.weightUnit }, set: { userSettings.setWeightUnit($0) }))
            unitPicker("Distance", systemImage: "ruler", metric: "m", imperial: "ft", selection: Binding(get: { userSettings.distanceUnit }, set: { userSettings.setDistanceUnit($0) }))
        } header: {
            Text("Training")
        } footer: {
            Text("Your bodyweight is used as the weight of bodyweight exercises.")
        }
    }

    private func unitPicker(_ title: String, systemImage: String, metric: String, imperial: String, selection: Binding<UnitSystem>) -> some View {
        LabeledContent {
            AppColorSegmentedPicker(options: [UnitSystem.metric, .imperial], selection: selection) { $0 == .metric ? metric : imperial }
                .frame(width: 120)
        } label: {
            SettingsLabel(title, systemImage: systemImage)
        }
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                SettingsLabel("App color", systemImage: "paintpalette")
                AppColorSwatches()
            }
            .padding(.vertical, 4)
            .disabled(!userSettings.isAvailable)

            // Only stored on the device, so it can always be changed
            LabeledContent {
                AppColorSegmentedPicker(options: AppTheme.allCases, selection: $theme) { $0.title }
                    .frame(width: 190)
            } label: {
                SettingsLabel("Theme", systemImage: "circle.lefthalf.filled")
            }
        } header: {
            Text("Appearance")
        }
    }

    // MARK: - Privacy and data

    private var privacySection: some View {
        Section {
            NavigationLink {
                BlockedUsersView()
            } label: {
                LabeledContent {
                    Text("\(blockedUsers.count)")
                } label: {
                    SettingsLabel("Blocked users", systemImage: "hand.raised")
                }
            }
            SyncLink()
        } header: {
            Text("Privacy and data")
        }
    }
}

// MARK: - Bodyweight

private struct BodyweightRow: View {

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
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                SettingsLabel("Bodyweight", systemImage: "figure.stand")
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
            if !isValid {
                Text("Enter a weight between 0 and \(UnitSystem.number(unit.weight(fromKilograms: 1000), maxDecimals: 0)) \(unit.weightSymbol).")
                    .font(.footnote)
                    .foregroundStyle(.red)
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

// MARK: - App color

/// A choice of colors that work as the app color, and the color picker for any other
private struct AppColorSwatches: View {

    private static let presets = ["#FF0000", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55"]

    @Environment(UserSettings.self) var userSettings

    private var isCustom: Bool {
        !Self.presets.contains(userSettings.schemeColor.uppercased())
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Self.presets, id: \.self) { hex in
                let isSelected = userSettings.schemeColor.uppercased() == hex
                Button {
                    userSettings.setColor(Color(hex: hex)!)
                } label: {
                    Circle()
                        .fill(Color(hex: hex)!)
                        .frame(width: 26, height: 26)
                        .padding(3)
                        .overlay {
                            if isSelected {
                                Circle().strokeBorder(Color.primary.opacity(0.8), lineWidth: 2)
                            }
                        }
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(hex)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }

            // Any other color, with a ring like the selected presets while one is chosen
            ColorPicker("Other color", selection: Binding(get: { userSettings.appColor }, set: { userSettings.setColor($0) }), supportsOpacity: false)
                .labelsHidden()
                .padding(3)
                .overlay {
                    if isCustom {
                        Circle().strokeBorder(Color.primary.opacity(0.8), lineWidth: 2)
                    }
                }
                .frame(maxWidth: .infinity)
        }
    }
}

// MARK: - Sync

/// Opens the state of the sync, with the problems in red
private struct SyncLink: View {

    @Environment(SyncService.self) private var syncService

    var body: some View {
        NavigationLink {
            SyncView()
        } label: {
            LabeledContent {
                if !syncService.problems.isEmpty {
                    Text(syncService.problems.count == 1 ? "1 problem" : "\(syncService.problems.count) problems")
                        .foregroundStyle(.red)
                } else {
                    switch syncService.state {
                    case .idle: Text("Up to date")
                    case .syncing: Text("Syncing…")
                    case .failed: Text("Failed").foregroundStyle(.red)
                    }
                }
            } label: {
                SettingsLabel("Sync", systemImage: "arrow.triangle.2.circlepath")
            }
        }
    }
}

/// The state of the sync, the manual resync and what is out of sync
private struct SyncView: View {

    @Environment(SyncService.self) private var syncService

    @State private var isResyncing = false
    @State private var didFinish = false

    var body: some View {
        Form {
            Section {
                LabeledContent("Status") {
                    switch syncService.state {
                    case .idle: Text("Up to date")
                    case .syncing: Text("Syncing…")
                    case .failed: Text("Failed").foregroundStyle(.red)
                    }
                }
                if let lastSyncDate = syncService.lastSyncDate {
                    LabeledContent("Last synced") {
                        Text(lastSyncDate, format: .relative(presentation: .named))
                    }
                }
                if case .failed(let message) = syncService.state {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            if !syncService.problems.isEmpty {
                Section {
                    NavigationLink {
                        SyncProblemsView()
                    } label: {
                        LabeledContent {
                            Text("\(syncService.problems.count)")
                                .foregroundStyle(.red)
                        } label: {
                            Label("Sync problems", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                        }
                    }
                }
            }

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
                        Text("Resync everything")
                        Spacer()
                        if isResyncing {
                            ProgressView()
                        }
                    }
                }
                .disabled(isResyncing)
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
        .navigationTitle("Sync")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - About

private struct AboutSection: View {

    private static let email = "gym2@colinrueegg.com"

    @Environment(\.openURL) private var openURL
    /// The web page or email to open once the user confirmed leaving the app
    @State private var pendingURL: URL?

    var body: some View {
        Section {
            Button {
                pendingURL = URL(string: "mailto:\(Self.email)")
            } label: {
                LinkRow(title: "Contact and feedback", systemImage: "envelope")
            }
            Button {
                pendingURL = URL(string: "https://github.com/xcolx/Gym-2.0")
            } label: {
                LinkRow(title: "Source code", systemImage: "chevron.left.forwardslash.chevron.right")
            }
            Button {
                pendingURL = URL(string: "https://gym2.app/tos")
            } label: {
                LinkRow(title: "Terms of use", systemImage: "doc.text")
            }
            Button {
                pendingURL = URL(string: "https://gym2.app/privacy")
            } label: {
                LinkRow(title: "Privacy policy", systemImage: "lock.shield")
            }
        } header: {
            Text("About")
        }
        .alert("Leave Gym 2.0?", isPresented: Binding(get: { pendingURL != nil }, set: { if !$0 { pendingURL = nil } })) {
            Button("Open") {
                if let pendingURL { openURL(pendingURL) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(pendingURL?.scheme == "mailto" ? "This opens your mail app to write an email to \(Self.email)." : "This opens the page in your browser.")
        }
    }
}

private struct LinkRow: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack {
            SettingsLabel(title, systemImage: systemImage)
            Spacer()
            Image(systemName: "arrow.up.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
    }
}
