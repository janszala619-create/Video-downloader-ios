import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeMediaPlugin {
  play(options: { path: string }): Promise<void>
  saveToPhotos(options: { path: string }): Promise<void>
}

const NativeMedia = registerPlugin<NativeMediaPlugin>('NativeMedia')

export function supportsNativeMedia(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

export async function playLocalVideo(path: string): Promise<void> {
  await NativeMedia.play({ path })
}

export async function saveToPhotos(path: string): Promise<void> {
  await NativeMedia.saveToPhotos({ path })
}
