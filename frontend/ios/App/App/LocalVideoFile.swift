import Foundation

enum LocalVideoFile {
    static func resolve(_ path: String, documents: URL) throws -> URL {
        let directory = documents.appendingPathComponent("VidSave", isDirectory: true).resolvingSymlinksInPath()
        let file = documents.appendingPathComponent(path).resolvingSymlinksInPath()
        guard path.hasPrefix("VidSave/"), file.path.hasPrefix(directory.path + "/") else {
            throw NSError(domain: "VidSave", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid video file path."])
        }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory),
              !isDirectory.boolValue, FileManager.default.isReadableFile(atPath: file.path) else {
            throw NSError(domain: "VidSave", code: 2, userInfo: [NSLocalizedDescriptionKey: "The video file is missing. Please download it again."])
        }
        return file
    }
}
