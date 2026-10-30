//
//  ReportAlert.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI

enum ReportTarget: Identifiable {
    /// With `blocks` the user is blocked as well ("Block and Report…"). `profile` is for users that aren't stored
    /// yet, e.g. the sender of a friend request.
    case user(id: Int, username: String, profile: UserDTO? = nil, blocks: Bool = false)
    case chat(id: Int, name: String)
    /// With `deletes` the message is deleted for everyone after the report ("Delete and Report…", for group admins)
    case message(id: Int, senderName: String?, deletes: Bool = false)

    var id: String {
        switch self {
        case .user(let id, _, _, _): "user\(id)"
        case .chat(let id, _): "chat\(id)"
        case .message(let id, _, _): "message\(id)"
        }
    }

    var title: String {
        switch self {
        case .user(_, let username, _, _): "Report \(username)"
        case .chat(_, let name): "Report \(name)"
        case .message(_, let senderName?, _): "Report Message from \(senderName)"
        case .message(_, nil, _): "Report Message"
        }
    }
}

extension View {
    /// Asks for the reason of the report, sends it and shows whether it worked. For a user with `blocks`, `block` is
    /// called first, so the view can update its lists like after a plain block. For a message with `deletes`, `delete`
    /// is called after the report, since deleted messages can't be reported (the report keeps a copy of it).
    func reportAlert(
        for target: Binding<ReportTarget?>,
        block: ((_ id: Int, _ profile: UserDTO?) async throws -> Void)? = nil,
        delete: ((_ messageId: Int) async throws -> Void)? = nil
    ) -> some View {
        modifier(ReportAlert(target: target, block: block, delete: delete))
    }
}

private struct ReportAlert: ViewModifier {

    @Binding var target: ReportTarget?
    let block: ((Int, UserDTO?) async throws -> Void)?
    let delete: ((Int) async throws -> Void)?

    @Environment(\.reportService) private var reportService

    @State private var reason = ""
    @State private var result: (title: String, message: String)?

    /// Like the backend
    private static let maxReasonLength = 500

    private var trimmedReason: String {
        reason.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func body(content: Content) -> some View {
        content
            .alert(target?.title ?? "", isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }), presenting: target) { target in
                TextField("Reason", text: $reason)
                Button("Report", role: .destructive) {
                    send(target, reason: String(trimmedReason.prefix(Self.maxReasonLength)))
                    reason = ""
                }
                .disabled(trimmedReason.isEmpty)
                Button("Cancel", role: .cancel) { reason = "" }
            } message: { target in
                if case .user(_, _, _, true) = target {
                    Text("They will be blocked as well. The report is reviewed within 24 hours.")
                } else if case .message(_, _, true) = target {
                    Text("It will be deleted for everyone as well. The report is reviewed within 24 hours.")
                } else {
                    Text("The report is reviewed within 24 hours.")
                }
            }
            .alert(result?.title ?? "", isPresented: Binding(get: { result != nil }, set: { if !$0 { result = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(result?.message ?? "")
            }
    }

    private func send(_ target: ReportTarget, reason: String) {
        guard let reportService else { return }
        Task {
            do {
                if case .user(let id, _, let profile, true) = target {
                    try await block?(id, profile)
                }
                try await reportService.report(target, reason: reason)
                if case .message(let id, _, true) = target {
                    try await delete?(id)
                }
                result = ("Report Sent", "Thank you. The report is reviewed within 24 hours.")
            } catch {
                result = ("Could not report", error.localizedDescription)
            }
        }
    }
}
