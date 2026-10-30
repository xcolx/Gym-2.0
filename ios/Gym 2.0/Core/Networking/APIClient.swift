//
//  APIClient.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import OSLog

enum APIConfiguration {
    static let baseURL = URL(string: "https://api.gym2.app/v1")!
}

/// Sends requests to the backend and keeps the session.
///
/// The backend authenticates with an HTTP-only `session_token` cookie. The client handles that cookie itself
/// instead of using the shared cookie storage: it's read from the login response, kept in the Keychain and
/// sent along with every request.
final class APIClient {
    static let sessionCookieName = "session_token"
    private static let sessionTokenAccount = "sessionToken"

    private let baseURL: URL
    private let session: URLSession
    private let keychain: KeychainStore
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    /// Called when the stored session ends: the backend rejected it (401) or cleared the cookie (e.g. logout,
    /// account deletion). The app can show the login screen then.
    var onSessionEnded: (@MainActor () -> Void)?
    /// Called when the backend retired the API version of this app (410). The app has to be updated to work again.
    var onUpdateRequired: (@MainActor () -> Void)?
    /// Called for every response with a `Deprecation` header: the API version still works, but a newer app version
    /// is available.
    var onUpdateAvailable: (@MainActor () -> Void)?

    /// `configuration` is only replaced by the tests, e.g. to answer the requests with a stub
    init(baseURL: URL = APIConfiguration.baseURL, keychain: KeychainStore = KeychainStore(), configuration: URLSessionConfiguration = .default) {
        self.baseURL = baseURL
        self.keychain = keychain

        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 30
        session = URLSession(configuration: configuration)

        encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { try APIClient.decodeDate(from: $0) }

        clearSessionAfterReinstall()
    }

    /// Keychain items survive deleting the app, UserDefaults don't. Without the flag this is a fresh install,
    /// so a session token left over from a previous install is removed and the user has to log in again.
    private func clearSessionAfterReinstall() {
        let key = "hasLaunchedBefore"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        clearSession()
        UserDefaults.standard.set(true, forKey: key)
    }

    /// The backend sends ISO 8601 dates with a UTC offset, with or without fractional seconds.
    private static func decodeDate(from decoder: Decoder) throws -> Date {
        let container = try decoder.singleValueContainer()
        let string = try container.decode(String.self)

        guard let date = fractionalDateFormatter.date(from: string) ?? dateFormatter.date(from: string) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO 8601 date: \(string)")
        }
        return date
    }

    // ISO8601DateFormatter is thread safe
    private static let dateFormatter = ISO8601DateFormatter()
    private static let fractionalDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    var hasSession: Bool {
        sessionToken != nil
    }

    private var sessionToken: String? {
        keychain.string(for: Self.sessionTokenAccount)
    }

    func clearSession() {
        keychain.remove(Self.sessionTokenAccount)
    }

    // MARK: - Requests

    func send<Response: Decodable>(_ endpoint: Endpoint, as type: Response.Type = Response.self) async throws -> Response {
        let data = try await perform(endpoint)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    /// For requests whose response body isn't needed.
    func send(_ endpoint: Endpoint) async throws {
        _ = try await perform(endpoint)
    }

    /// The raw response body, e.g. for images.
    func data(_ endpoint: Endpoint) async throws -> Data {
        try await perform(endpoint)
    }

    private func perform(_ endpoint: Endpoint) async throws -> Data {
        let request = try makeRequest(for: endpoint)
        let sentSession = hasSession

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            throw APIError.transport(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        Logger.api.debug("\(endpoint.method.rawValue, privacy: .public) \(endpoint.path, privacy: .public) → \(httpResponse.statusCode)")
        storeSessionCookie(from: httpResponse)
        if httpResponse.statusCode == 401 {
            clearSession()
        }
        // Failed logins are 401 as well, but there is no session to lose then
        if sentSession && !hasSession {
            await onSessionEnded?()
        }
        // The backend only uses 410 for retired API versions
        if httpResponse.statusCode == 410 {
            await onUpdateRequired?()
        } else if httpResponse.value(forHTTPHeaderField: "Deprecation") != nil {
            await onUpdateAvailable?()
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw error(for: httpResponse.statusCode, data: data)
        }
        return data
    }

    private func makeRequest(for endpoint: Endpoint) throws -> URLRequest {
        var components = URLComponents(url: baseURL.appending(path: endpoint.path), resolvingAgainstBaseURL: false)!
        if !endpoint.queryItems.isEmpty {
            components.queryItems = endpoint.queryItems
            // URLComponents leaves "+" as is, which the server reads as a space (e.g. in "+00:00" of a timestamp)
            components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        }

        var request = URLRequest(url: components.url!)
        request.httpMethod = endpoint.method.rawValue
        if let timeout = endpoint.timeout {
            request.timeoutInterval = timeout
        }
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        switch endpoint.body {
        case .json(let body):
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        case .multipart(let form):
            request.httpBody = form.encoded()
            request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        case nil:
            break
        }
        if let sessionToken {
            request.setValue("\(Self.sessionCookieName)=\(sessionToken)", forHTTPHeaderField: "Cookie")
        }
        return request
    }

    // MARK: - Session cookie

    /// Login sets the cookie, logout and rejected sessions clear it (empty value / Max-Age=0).
    private func storeSessionCookie(from response: HTTPURLResponse) {
        guard let url = response.url,
              let headers = response.allHeaderFields as? [String: String] else { return }

        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: url)
        guard let cookie = cookies.first(where: { $0.name == Self.sessionCookieName }) else { return }

        if cookie.value.isEmpty || (cookie.expiresDate.map { $0 <= Date() } ?? false) {
            clearSession()
        } else {
            keychain.set(cookie.value, for: Self.sessionTokenAccount)
        }
    }

    // MARK: - Errors

    private func error(for status: Int, data: Data) -> APIError {
        let body = try? decoder.decode(APIErrorBody.self, from: data)
        let message = body?.message ?? HTTPURLResponse.localizedString(forStatusCode: status).capitalized

        if status == 401 {
            return .unauthorized(message: message)
        }
        if status == 410 {
            return .updateRequired(message: message)
        }
        return .server(status: status, code: body?.code, message: message)
    }
}

extension Logger {
    static let api = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Gym 2.0", category: "API")
}
