//
//  LegacyImportView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import SwiftUI

/// Uploads the data of the previous app version after the first login. The app can only be used once it is
/// imported, or once the user decided to continue without it because it doesn't fit the server. There is no logout
/// here: the data belongs to the account that signed in first and would otherwise be imported into the next one.
struct LegacyImportView: View {

    @Environment(LegacyImportService.self) private var legacyImportService
    @Environment(UserSettings.self) private var userSettings

    @State private var exportedFiles: [URL] = []
    @State private var exportError: String?
    @State private var confirmsDiscard = false
    @State private var discardError: String?

    var body: some View {
        NavigationStack {
            content
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .navigationTitle("Your Data")
                .navigationBarTitleDisplayMode(.inline)
        }
        .tint(userSettings.appColor)
        .interactiveDismissDisabled()
        // Also after logging out and in again, so that no result of the previous attempt is shown
        .task {
            await legacyImportService.importData()
        }
        .confirmationDialog("Continue without your old data?", isPresented: $confirmsDiscard, titleVisibility: .visible) {
            Button("Continue Without Old Data", role: .destructive, action: discard)
        } message: {
            Text("Your old workouts, schemes and exercises are removed from this device. Download them first if you want to keep them.")
        }
        .alert("Could not continue", isPresented: Binding(get: { discardError != nil }, set: { if !$0 { discardError = nil } })) {
        } message: {
            Text(discardError ?? "")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch legacyImportService.state {
        case .idle, .importing:
            importingView
        case .failed(let message):
            failedView(message: message)
        case .unmatched(let issues):
            unmatchedView(issues: issues)
        }
    }

    // MARK: - Importing

    private var importingView: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "icloud.and.arrow.up")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("Moving your data to your account")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("Gym 2.0 now saves your workouts to your account. Your workouts, workout schemes and exercises from the previous version are being uploaded. This only happens once.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            if case .importing(let done, let total) = legacyImportService.state, total > 0 {
                ProgressView(value: Double(done), total: Double(total)) {
                    Text("\(done) of \(total)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } else {
                ProgressView()
            }
            Spacer()
            Text("Please keep the app open.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Network or server error

    private func failedView(message: String) -> some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("Your data couldn't be uploaded")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("Your workouts from the previous version have to be moved to your account before you can continue. Nothing is lost, they are still on this device.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
            Spacer()
            Button {
                Task { await legacyImportService.importData() }
            } label: {
                Label("Try Again", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
    }

    // MARK: - Data doesn't fit the server

    private func unmatchedView(issues: [String]) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundStyle(.tint)
            Text("Your old data can't be imported")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("Gym 2.0 now saves your workouts to your account, so the exercises they use have to exist there. Some of the data from the previous version doesn't match the exercises of the new version, so it can't be moved to your account.\n\nDownload your old data to keep it. You get a JSON file with everything and a CSV file with your workouts, which you can open in any spreadsheet app.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            List {
                Section("What doesn't match") {
                    ForEach(issues, id: \.self) { issue in
                        Text(issue)
                            .font(.footnote)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)

            if let exportError {
                Text(exportError)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            if exportedFiles.isEmpty {
                Button {
                } label: {
                    Label("Download Old Data", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(true)
            } else {
                ShareLink(items: exportedFiles) {
                    Label("Download Old Data", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }

            HStack {
                Button("Try Again") {
                    Task { await legacyImportService.importData() }
                }
                Spacer()
                Button("Continue Without", role: .destructive) {
                    confirmsDiscard = true
                }
            }
            .padding(.horizontal)
        }
        .onAppear(perform: export)
    }

    private func export() {
        do {
            exportedFiles = try legacyImportService.exportFiles()
            exportError = nil
        } catch {
            exportError = "The download couldn't be prepared: \(error.localizedDescription)"
        }
    }

    private func discard() {
        do {
            try legacyImportService.discard()
        } catch {
            discardError = error.localizedDescription
        }
    }
}
