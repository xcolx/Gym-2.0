//
//  StubURLProtocol.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  A fake backend for APIClient and the sync: requests to a host that was registered here are answered by its handler
//  instead of the network. Every test registers its own random host, so tests running in parallel don't interfere.
//

import Foundation
@testable import Gym_2_0

final class StubURLProtocol: URLProtocol {

    struct Response {
        var status: Int = 200
        var headers: [String: String] = ["Content-Type": "application/json"]
        var body: Data = Data()

        static func json(_ text: String, status: Int = 200, headers: [String: String] = [:]) -> Response {
            Response(status: status, headers: ["Content-Type": "application/json"].merging(headers) { $1 }, body: Data(text.utf8))
        }
    }

    /// The request as it was sent, with its body (URLProtocol only gets it as a stream)
    struct Request {
        let method: String
        let url: URL
        let headers: [String: String]
        let body: Data
        let timeout: TimeInterval

        /// The path below the API base URL, e.g. "/workouts"
        var path: String { url.path(percentEncoded: false).replacingOccurrences(of: "/v1", with: "", options: .anchored) }

        var json: [String: Any]? {
            (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        }
    }

    typealias Handler = (Request) throws -> Response

    private static let lock = NSLock()
    nonisolated(unsafe) private static var handlers: [String: Handler] = [:]

    /// A base URL whose requests are answered by `handler`. Throwing a URLError simulates a missing connection.
    static func baseURL(handler: @escaping Handler) -> URL {
        let host = "\(UUID().uuidString.lowercased()).stub.invalid"
        lock.withLock { handlers[host] = handler }
        return URL(string: "https://\(host)/v1")!
    }

    /// A session configuration that sends the requests to the stub (a registered URLProtocol isn't used by own sessions)
    static var configuration: URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return configuration
    }

    /// An API client whose requests are answered by `handler`, with a Keychain item of its own
    static func client(handler: @escaping Handler) -> APIClient {
        APIClient(baseURL: baseURL(handler: handler), keychain: KeychainStore(service: "Gym2Tests.\(UUID().uuidString)"), configuration: configuration)
    }

    static func remove(_ baseURL: URL) {
        lock.withLock { handlers[baseURL.host() ?? ""] = nil }
    }

    private static func handler(for url: URL?) -> Handler? {
        lock.withLock { handlers[url?.host() ?? ""] }
    }

    override class func canInit(with request: URLRequest) -> Bool {
        handler(for: request.url) != nil
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let url = request.url, let handler = Self.handler(for: url) else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        let stubRequest = Request(
            method: request.httpMethod ?? "GET",
            url: url,
            headers: request.allHTTPHeaderFields ?? [:],
            body: request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data(),
            timeout: request.timeoutInterval
        )
        do {
            let response = try handler(stubRequest)
            let httpResponse = HTTPURLResponse(url: url, statusCode: response.status, httpVersion: "HTTP/1.1", headerFields: response.headers)!
            client?.urlProtocol(self, didReceive: httpResponse, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: response.body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
