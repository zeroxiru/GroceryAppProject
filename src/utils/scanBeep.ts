import { Audio } from 'expo-av';

/**
 * The short beep on a successful barcode scan (PRD FR-8: haptic + sound). The sound is loaded once and replayed, so
 * a fast run of scans never waits on disk. Every step is wrapped: a device with no audio, or a build without the
 * native module, just stays silent — scanning never fails because of the beep.
 */
let sound: Audio.Sound | null = null;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound: s } = await Audio.Sound.createAsync(require('../../assets/sounds/scan-beep.wav'), { volume: 1 });
    sound = s;
  } catch {
    sound = null;
  }
}

/** Call when the scanner opens so the first beep is instant. */
export function preloadScanBeep(): void {
  if (!loading) loading = load();
}

export async function playScanBeep(): Promise<void> {
  try {
    if (!loading) loading = load();
    await loading;
    await sound?.replayAsync();
  } catch {
    /* silent */
  }
}
