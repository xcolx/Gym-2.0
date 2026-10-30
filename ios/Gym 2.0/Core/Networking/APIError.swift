//
//  APIError.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

enum APIError: LocalizedError {
    /// The request never reached the server (offline, timeout, server down).
    case transport(URLError)
    /// The session cookie is missing, expired or was invalidated. The stored token has already been removed.
    case unauthorized(message: String)
    /// The server answered with an error status. `code` is the backend's error class name, e.g. "EmailVerificationError".
    case server(status: Int, code: String?, message: String)
    /// The backend retired the API version of this app (410), it only works again after an update. Not a `.server`
    /// error, so that the sync doesn't treat it as a rejected change and keeps the local changes.
    case updateRequired(message: String)
    /// The response body didn't match the expected type.
    case decoding(Error)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .transport:
            return "Could not reach the server. Please check your internet connection."
        case .unauthorized(let message), .server(_, _, let message), .updateRequired(let message):
            return message
        case .decoding, .invalidResponse:
            return "Received an unexpected response from the server."
        }
    }

    var status: Int? {
        switch self {
        case .unauthorized: return 401
        case .server(let status, _, _): return status
        case .updateRequired: return 410
        default: return nil
        }
    }
}

/// The error bodies the backend sends:
/// - app errors: {"error": "EmailVerificationError", "detail": "..."}
/// - HTTPException: {"detail": "..."}
/// - validation errors (422): {"detail": [{"msg": "...", ...}]}
/// - rate limits (429): {"error": "Rate limit exceeded: 5 per 1 minute"}
/// - retired API versions (410): {"error": "ApiVersionRetiredError", "detail": "..."}
struct APIErrorBody: Decodable {
    let error: String?
    let detail: Detail?

    enum Detail: Decodable {
        case message(String)
        case validation([ValidationIssue])

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let message = try? container.decode(String.self) {
                self = .message(message)
            } else {
                self = .validation(try container.decode([ValidationIssue].self))
            }
        }
    }

    struct ValidationIssue: Decodable {
        let msg: String
    }

    var message: String? {
        switch detail {
        case .message(let message):
            return message
        case .validation(let issues):
            // Pydantic prefixes custom validator messages with "Value error, "
            return issues.map { $0.msg.replacingOccurrences(of: "Value error, ", with: "") }.joined(separator: "\n")
        case nil:
            return error
        }
    }

    /// The backend's error class name. Rate limit responses put their message into `error` instead.
    var code: String? {
        detail == nil ? nil : error
    }
}
