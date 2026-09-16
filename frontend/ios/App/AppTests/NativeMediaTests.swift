import AVKit
import Capacitor
import Photos
import XCTest
@testable import App

final class NativeMediaTests: XCTestCase {
    private var path = ""
    private var documents: URL!
    private var file: URL!

    override func setUpWithError() throws {
        documents = try XCTUnwrap(FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first)
        path = "VidSave/Test # 100% ü \(UUID().uuidString).mp4"
        file = documents.appendingPathComponent(path)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let sample = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "sample", withExtension: "mp4"))
        try FileManager.default.copyItem(at: sample, to: file)
    }

    override func tearDownWithError() throws {
        if let file { try? FileManager.default.removeItem(at: file) }
    }

    func testFilenameWithSpacesUnicodeAndURLCharacters() throws {
        XCTAssertEqual(try LocalVideoFile.resolve(path, documents: documents), file)
        XCTAssertThrowsError(try LocalVideoFile.resolve("VidSave/missing.mp4", documents: documents))
        XCTAssertThrowsError(try LocalVideoFile.resolve("VidSave/../../outside.mp4", documents: documents))
        XCTAssertThrowsError(try LocalVideoFile.resolve("/etc/passwd", documents: documents))
    }

    @MainActor
    private func plugin() throws -> (MediaPlugin, VidSaveViewController) {
        let delegate = try XCTUnwrap(UIApplication.shared.delegate as? AppDelegate)
        let controller = try XCTUnwrap(delegate.window?.rootViewController as? VidSaveViewController)
        controller.loadViewIfNeeded()
        return (try XCTUnwrap(controller.bridge?.plugin(withName: "NativeMedia") as? MediaPlugin), controller)
    }

    @MainActor
    func testNativePlayerActuallyAdvancesDownloadedVideo() throws {
        let (plugin, controller) = try plugin()
        let presented = expectation(description: "Native player presented")
        let call = try XCTUnwrap(CAPPluginCall(callbackId: "play-test", methodName: "play", options: ["path": path], success: { _, _ in
            presented.fulfill()
        }, error: { error in
            XCTFail("Native playback failed: \(String(describing: error))")
            presented.fulfill()
        }))
        plugin.play(call)
        wait(for: [presented], timeout: 20)
        let playerController = try XCTUnwrap(controller.presentedViewController as? AVPlayerViewController)
        let player = try XCTUnwrap(playerController.player)
        defer { player.pause(); controller.dismiss(animated: false) }
        let advancing = expectation(description: "Decoded video playback advances")
        advancing.assertForOverFulfill = false
        let observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main) { time in
            if time.seconds > 0.1 { advancing.fulfill() }
        }
        wait(for: [advancing], timeout: 20)
        player.removeTimeObserver(observer)
        XCTAssertNil(player.currentItem?.error)
    }

    @MainActor
    func testSaveDownloadedVideoToPhotos() throws {
        guard #available(iOS 14, *) else { throw XCTSkip("Add-only Photos requires iOS 14") }
        XCTAssertEqual(PHPhotoLibrary.authorizationStatus(for: .addOnly), .authorized)
        let (plugin, _) = try plugin()
        let saved = expectation(description: "Video saved to simulator photo library")
        let call = try XCTUnwrap(CAPPluginCall(callbackId: "photos-test", methodName: "saveToPhotos", options: ["path": path], success: { _, _ in
            saved.fulfill()
        }, error: { error in
            XCTFail("Saving to Photos failed: \(String(describing: error))")
            saved.fulfill()
        }))
        plugin.saveToPhotos(call)
        wait(for: [saved], timeout: 30)
    }
}
