//
//  AccountSettingsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import PhotosUI
import SwiftUI
import SwiftData

// The account of the current user. Unlike the other settings, these changes need a connection.

/// Profile image, username, email, password, data takeout, logout and deleting the account
struct AccountSection: View {

    let user: User

    @Environment(\.modelContext) private var context
    @Environment(AuthService.self) private var authService
    @Environment(SyncService.self) private var syncService
    @Environment(\.userService) private var userService

    var body: some View {
        let services = AccountServices(auth: authService, sync: syncService, userService: userService, users: UserRepository(context: context))
        AccountSectionContentView(model: AccountSectionViewModel(services: services), user: user, services: services)
    }
}

private struct AccountSectionContentView: View {

    @State private var model: AccountSectionViewModel
    let user: User
    let services: AccountServices

    // The view model is created once, later ones of the parent's body are discarded
    init(model: AccountSectionViewModel, user: User, services: AccountServices) {
        _model = State(initialValue: model)
        self.user = user
        self.services = services
    }

    var body: some View {
        @Bindable var model = model
        Section {
            ProfileImageRow(model: ProfileImageViewModel(user: user, services: services))
            NavigationLink {
                ChangeUsernameView(model: ChangeUsernameViewModel(user: user, services: services))
            } label: {
                LabeledContent("Username", value: user.username)
            }
            NavigationLink {
                ChangeEmailView(model: ChangeEmailViewModel(user: user, services: services))
            } label: {
                LabeledContent("Email", value: user.email ?? "")
            }
            NavigationLink("Password") {
                ChangePasswordView(model: ChangePasswordViewModel(services: services))
            }
            NavigationLink("Data Takeout") {
                DataTakeoutView(model: DataTakeoutViewModel(services: services))
            }
            Button {
                model.showsLogoutConfirmation = true
            } label: {
                HStack {
                    Text("Log Out")
                    Spacer()
                    if model.isLoggingOut { ProgressView() }
                }
            }
            .disabled(model.isLoggingOut)
            Button(role: .destructive) {
                model.showsDeleteConfirmation = true
            } label: {
                HStack {
                    Text("Delete Account")
                    Spacer()
                    if model.isDeleting { ProgressView() }
                }
            }
            .disabled(model.isDeleting)
        } header: {
            Text("Account")
        } footer: {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .confirmationDialog("Log out?", isPresented: $model.showsLogoutConfirmation, titleVisibility: .visible) {
            Button("Log Out", role: .destructive) { logout(force: false) }
        }
        .alert("Not everything is uploaded", isPresented: $model.showsUnpushedChanges) {
            Button("Try Again") { logout(force: false) }
            Button("Log Out Anyway", role: .destructive) { logout(force: true) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(UnpushedChanges.message)
        }
        .alert("Delete your account?", isPresented: $model.showsDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                model.confirmDeletion()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You will be logged out and can't log in with this account anymore.")
        }
        // A second step, so that no account is deleted by mistake
        .alert("Are you sure?", isPresented: $model.showsFinalDeleteConfirmation) {
            // Delete on the left, unlike the first alert, so that tapping the same spot twice doesn't delete.
            // Cancel has no cancel role, iOS would always place it on the left otherwise.
            SecureField("Password", text: $model.deletePassword)
                .textContentType(.password)
            Button("Delete", role: .destructive) {
                Task { await model.deleteAccount() }
            }
                .disabled(!model.canDelete)
            Button("Cancel") {}
                .keyboardShortcut(.defaultAction)
        } message: {
            Text("All of your progress and all data stored on Gym 2.0 will be deleted: your workouts, workout schemes, exercises, stats, chats, friends and your profile. This can't be undone. Enter your password to confirm.")
        }
    }

    private func logout(force: Bool) {
        Task { await model.logout(force: force) }
    }
}

// MARK: - Profile image

private struct ProfileImageRow: View {

    @State private var model: ProfileImageViewModel

    init(model: ProfileImageViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        let user = model.user
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 16) {
                ProfileIconView(hash: user.profileIconUrl, size: 64, color: user.schemeColor, imageHash: user.profileImageUrl)
                    .overlay {
                        if model.isUploading {
                            ProgressView()
                        }
                    }
                PhotosPicker(selection: $model.selectedPhoto, matching: .images, photoLibrary: .shared()) {
                    Text(user.profileImageUrl.isEmpty ? "Add Profile Image" : "Change Profile Image")
                }
                .buttonStyle(.borderless)
                .disabled(model.isUploading)
                if !user.profileImageUrl.isEmpty {
                    Button("Remove", role: .destructive) {
                        Task { await model.remove() }
                    }
                    .buttonStyle(.borderless)
                    .disabled(model.isUploading)
                }
            }
            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .task(id: model.selectedPhoto) {
            await model.loadSelectedPhoto()
        }
        .fullScreenCover(item: $model.imageToCrop) { picked in
            ProfileImageCropView(image: picked.image) {
                model.imageToCrop = nil
            } onChoose: { cropped in
                model.imageToCrop = nil
                Task { await model.upload(cropped) }
            }
        }
    }
}

// MARK: - Username

private struct ChangeUsernameView: View {

    @State private var model: ChangeUsernameViewModel

    @Environment(\.dismiss) private var dismiss

    init(model: ChangeUsernameViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        Form {
            Section {
                TextField("Username", text: $model.username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } footer: {
                if let message = model.usernameProblem ?? model.errorMessage {
                    Text(message).foregroundStyle(.red)
                } else {
                    Text("Your username can be changed once a minute.")
                }
            }
            SaveButton(isSaving: model.isSaving, action: save)
                .disabled(!model.canSave)
        }
        .navigationTitle("Username")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { model.onAppear() }
    }

    private func save() {
        Task {
            if await model.save() {
                dismiss()
            }
        }
    }
}

// MARK: - Email

private struct ChangeEmailView: View {

    @State private var model: ChangeEmailViewModel

    @Environment(\.dismiss) private var dismiss

    init(model: ChangeEmailViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        Form {
            Section {
                LabeledContent("Current", value: model.user.email ?? "")
                TextField("New email", text: $model.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $model.password)
                    .textContentType(.password)
            } footer: {
                if let errorMessage = model.errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                } else {
                    Text("We send a confirmation link to the new email. Your email only changes once you open it, until then you keep logging in with the current one.")
                }
            }
            SaveButton(isSaving: model.isSaving) { Task { await model.save() } }
                .disabled(!model.canSave)
        }
        .navigationTitle("Email")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Confirm your new email", isPresented: Binding(get: { model.sentTo != nil }, set: { if !$0 { model.sentTo = nil } })) {
            Button("OK") { dismiss() }
        } message: {
            Text("We sent a link to \(model.sentTo ?? ""). Your email changes once you open it.")
        }
    }
}

// MARK: - Password

private struct ChangePasswordView: View {

    @State private var model: ChangePasswordViewModel

    @Environment(\.dismiss) private var dismiss

    init(model: ChangePasswordViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        Form {
            Section {
                SecureField("Current password", text: $model.currentPassword)
                    .textContentType(.password)
            }
            Section {
                SecureField("New password", text: $model.newPassword)
                    .textContentType(.newPassword)
                SecureField("Repeat new password", text: $model.passwordConfirmation)
                    .textContentType(.newPassword)
            } footer: {
                if let message = model.passwordProblem ?? model.errorMessage {
                    Text(message).foregroundStyle(.red)
                } else {
                    Text("You stay logged in on this device and are logged out on all others.")
                }
            }
            SaveButton(isSaving: model.isSaving) { Task { await model.save() } }
                .disabled(!model.canSave)
        }
        .navigationTitle("Password")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Password changed", isPresented: $model.showsSuccess) {
            Button("OK") { dismiss() }
        }
    }
}

// MARK: - Data takeout

/// Downloads all data the server stores about the account as a ZIP file, which can then be shared or saved
private struct DataTakeoutView: View {

    @State private var model: DataTakeoutViewModel

    init(model: DataTakeoutViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        Form {
            Section {
                if model.fileURL != nil {
                    Button {
                        model.showsShareSheet = true
                    } label: {
                        Label("Save or Share File", systemImage: "square.and.arrow.up")
                    }
                } else {
                    Button {
                        Task { await model.load() }
                    } label: {
                        HStack {
                            Text("Request Data")
                            Spacer()
                            if model.isLoading { ProgressView() }
                        }
                    }
                    .disabled(model.isLoading)
                }
            } footer: {
                if let errorMessage = model.errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                } else {
                    Text("A ZIP file with all data Gym 2.0 stores about your account: your profile, workouts, workout schemes, exercises, friends, chats, the messages you sent and your AI conversations as a JSON file, and your images.")
                }
            }
        }
        .navigationTitle("Data Takeout")
        .navigationBarTitleDisplayMode(.inline)
        // The file holds personal data, so it's removed once it was saved or shared, or the sheet was closed
        .sheet(isPresented: $model.showsShareSheet, onDismiss: model.removeFile) {
            if let fileURL = model.fileURL {
                ShareSheet(items: [fileURL]) {
                    model.showsShareSheet = false
                }
                .ignoresSafeArea()
            }
        }
        .onDisappear(perform: model.removeFile)
    }
}

// MARK: - Shared

/// The system share sheet, which unlike ShareLink tells when it's done
private struct ShareSheet: UIViewControllerRepresentable {

    let items: [Any]
    let onComplete: () -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in
            onComplete()
        }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

enum UnpushedChanges {
    static let message = "Some of your changes could not be uploaded, e.g. because you are offline. They stay on this device and are uploaded the next time you log in with this account."
}

private struct SaveButton: View {

    let isSaving: Bool
    let action: () -> Void

    var body: some View {
        Section {
            Button(action: action) {
                HStack {
                    Text("Save")
                    Spacer()
                    if isSaving { ProgressView() }
                }
            }
        }
    }
}
