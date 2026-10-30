//
//  MultipartFormData.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

/// A multipart/form-data body, for the endpoints that take a file (e.g. exercise images).
/// Lists are sent as repeated fields with the same name, which is what FastAPI expects.
struct MultipartFormData {
    let boundary = "Boundary-\(UUID().uuidString)"
    private var parts: [Part] = []

    private struct Part {
        let name: String
        let filename: String?
        let mimeType: String?
        let data: Data
    }

    var contentType: String {
        "multipart/form-data; boundary=\(boundary)"
    }

    mutating func append(_ value: String, name: String) {
        parts.append(Part(name: name, filename: nil, mimeType: nil, data: Data(value.utf8)))
    }

    mutating func append(_ value: Int, name: String) {
        append(String(value), name: name)
    }

    mutating func append(_ value: Bool, name: String) {
        append(value ? "true" : "false", name: name)
    }

    mutating func append(_ values: [Int], name: String) {
        values.forEach { append($0, name: name) }
    }

    mutating func append(_ values: [String], name: String) {
        values.forEach { append($0, name: name) }
    }

    mutating func appendFile(_ data: Data, name: String, filename: String, mimeType: String) {
        parts.append(Part(name: name, filename: filename, mimeType: mimeType, data: data))
    }

    func encoded() -> Data {
        var body = Data()
        for part in parts {
            var header = "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(part.name)\""
            if let filename = part.filename {
                header += "; filename=\"\(filename)\""
            }
            header += "\r\n"
            if let mimeType = part.mimeType {
                header += "Content-Type: \(mimeType)\r\n"
            }
            header += "\r\n"

            body.append(Data(header.utf8))
            body.append(part.data)
            body.append(Data("\r\n".utf8))
        }
        body.append(Data("--\(boundary)--\r\n".utf8))
        return body
    }
}
