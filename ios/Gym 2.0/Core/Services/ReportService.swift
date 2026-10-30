//
//  ReportService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 20.10.2026.
//

import Foundation
import SwiftUI

extension EnvironmentValues {
    @Entry var reportService: ReportService? = nil
}

/// Reports of users, group chats and messages against /reports, reviewed by the developer within 24 hours.
final class ReportService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// Fails with 400 if the user already reported the same user, chat or message.
    func report(_ target: ReportTarget, reason: String) async throws {
        let request = switch target {
        case .user(let id, _, _, _): CreateReportRequest(reportedUserId: id, reason: reason)
        case .chat(let id, _): CreateReportRequest(reportedChatId: id, reason: reason)
        case .message(let id, _, _): CreateReportRequest(reportedMessageId: id, reason: reason)
        }
        try await api.send(.createReport(request))
    }
}

/// Exactly one of the IDs is set
struct CreateReportRequest: Encodable {
    var reportedUserId: Int? = nil
    var reportedChatId: Int? = nil
    var reportedMessageId: Int? = nil
    /// Up to 500 characters
    let reason: String
}

private extension Endpoint {
    static func createReport(_ request: CreateReportRequest) -> Endpoint {
        Endpoint(method: .post, path: "/reports", body: .json(request))
    }
}
