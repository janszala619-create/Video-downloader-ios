import AVKit
import Capacitor
import Photos

@objc(MediaPlugin)
public class MediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MediaPlugin"
    public let jsName = "NativeMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToPhotos", returnType: CAPPluginReturnPromise)
    ]

    private func fileURL(for call: CAPPluginCall) throws -> URL {
        guard let path = call.getString("path"),
              let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            throw NSError(domain: "VidSave", code: 1, userInfo: [NSLocalizedDescriptionKey: "No downloaded video was selected."])
        }
        return try LocalVideoFile.resolve(path, documents: documents)
    }

    @objc func play(_ call: CAPPluginCall) {
        do {
            let url = try fileURL(for: call)
            let asset = AVURLAsset(url: url)
            asset.loadValuesAsynchronously(forKeys: ["playable"]) { [weak self] in
                var error: NSError?
                guard asset.statusOfValue(forKey: "playable", error: &error) == .loaded, asset.isPlayable else {
                    call.reject("This video format cannot be played on iPhone. Download an MP4 (H.264) version.", "UNSUPPORTED_VIDEO", error)
                    return
                }
                DispatchQueue.main.async {
                    guard let presenter = self?.bridge?.viewController, presenter.presentedViewController == nil else {
                        call.reject("Close the current player before opening another video.")
                        return
                    }
                    do {
                        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
                        try AVAudioSession.sharedInstance().setActive(true)
                    } catch {
                        call.reject("Could not start audio playback.", nil, error)
                        return
                    }
                    let controller = AVPlayerViewController()
                    controller.player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
                    controller.modalPresentationStyle = .fullScreen
                    presenter.present(controller, animated: true) {
                        controller.player?.play()
                        call.resolve()
                    }
                }
            }
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func saveToPhotos(_ call: CAPPluginCall) {
        do {
            let url = try fileURL(for: call)
            guard UIVideoAtPathIsCompatibleWithSavedPhotosAlbum(url.path) else {
                call.reject("Photos does not support this video format. Download an MP4 (H.264) version.", "UNSUPPORTED_VIDEO")
                return
            }
            guard #available(iOS 14, *) else {
                call.reject("Saving to Photos requires iOS 14 or later.")
                return
            }
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized else {
                    call.reject("Allow VidSave to add videos in iPhone Settings > Apps > VidSave > Photos, then try again.", "PHOTOS_PERMISSION_DENIED")
                    return
                }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: url, options: nil)
                }) { success, error in
                    if success {
                        call.resolve()
                    } else {
                        call.reject(error?.localizedDescription ?? "The video could not be saved to Photos.", "PHOTOS_SAVE_FAILED", error)
                    }
                }
            }
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }
}

class VidSaveViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MediaPlugin())
    }
}
