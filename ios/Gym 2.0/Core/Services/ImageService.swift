//
//  ImageService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import OSLog

/// Loads stored images (profile images, exercise images, chat photos, muscle images) by the hash in their *_url field.
///
/// Every upload gets a new hash and an image never changes under its hash, so the images are kept on disk by their
/// hash (in the caches directory) and in memory. A changed image of an exercise, a user or a chat has a new hash and
/// is loaded then. `prune(keeping:)` removes the images the stored data doesn't reference anymore.
actor ImageService {
    private let api: APIClient
    private let memory = NSCache<NSString, NSData>()
    /// The requests that are running, so that a list showing the same image several times loads it once
    private var running: [String: Task<Data, Error>] = [:]

    /// Images that aren't referenced (anymore) are kept this long after they were stored, e.g. the images of the
    /// public groups or of the senders of friend requests, which aren't stored
    static let unreferencedLifetime: TimeInterval = 7 * 24 * 60 * 60

    private static let directory = URL.cachesDirectory.appending(path: "Images", directoryHint: .isDirectory)

    init(api: APIClient) {
        self.api = api
        memory.totalCostLimit = 50 * 1024 * 1024
    }

    /// The JPEG data of the image. Fails with 404 if no image exists for the hash.
    func imageData(hash: String) async throws -> Data {
        if let cached = memory.object(forKey: hash as NSString) {
            return cached as Data
        }
        if let file = Self.fileURL(hash: hash), let data = try? Data(contentsOf: file) {
            memory.setObject(data as NSData, forKey: hash as NSString, cost: data.count)
            return data
        }
        if let task = running[hash] {
            return try await task.value
        }

        let task = Task { try await api.data(.image(hash: hash)) }
        running[hash] = task
        defer { running[hash] = nil }
        let data = try await task.value
        memory.setObject(data as NSData, forKey: hash as NSString, cost: data.count)
        store(data, hash: hash)
        return data
    }

    /// Removes the images on disk that aren't in `hashes` (the ones the stored data references) and were stored more
    /// than `unreferencedLifetime` ago
    func prune(keeping hashes: Set<String>) {
        let files = (try? FileManager.default.contentsOfDirectory(at: Self.directory, includingPropertiesForKeys: [.creationDateKey])) ?? []
        let oldest = Date.now.addingTimeInterval(-Self.unreferencedLifetime)
        var removed = 0
        for file in files where !hashes.contains(file.deletingPathExtension().lastPathComponent) {
            let created = (try? file.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast
            guard created < oldest else { continue }
            try? FileManager.default.removeItem(at: file)
            removed += 1
        }
        if removed > 0 {
            Logger.api.info("Removed \(removed) cached images that aren't used anymore")
        }
    }

    /// Removes all images from the disk and the memory, e.g. after a logout
    func removeAll() {
        running.values.forEach { $0.cancel() }
        running = [:]
        memory.removeAllObjects()
        try? FileManager.default.removeItem(at: Self.directory)
    }

    private func store(_ data: Data, hash: String) {
        guard let file = Self.fileURL(hash: hash) else { return }
        do {
            try FileManager.default.createDirectory(at: Self.directory, withIntermediateDirectories: true)
            try data.write(to: file, options: .atomic)
        } catch {
            Logger.api.error("Caching the image \(hash, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Nil for a hash that isn't one of the server's (64 hexadecimal characters), so it can't point outside the directory
    private static func fileURL(hash: String) -> URL? {
        guard hash.count == 64, hash.allSatisfy(\.isHexDigit) else { return nil }
        return directory.appending(path: "\(hash).jpg")
    }
}

private extension Endpoint {
    static func image(hash: String) -> Endpoint {
        Endpoint(method: .get, path: "/images/\(hash)")
    }
}
