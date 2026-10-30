//
//  Endpoint.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case put = "PUT"
    case delete = "DELETE"
}

enum RequestBody {
    case json(any Encodable)
    case multipart(MultipartFormData)
}

/// One request to the backend. The path is relative to the API base URL (e.g. "/auth/login/email").
struct Endpoint {
    let method: HTTPMethod
    let path: String
    var queryItems: [URLQueryItem] = []
    var body: RequestBody? = nil
    /// Overrides the default request timeout of the client, in seconds.
    var timeout: TimeInterval? = nil
}
