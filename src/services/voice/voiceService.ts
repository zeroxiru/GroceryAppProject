import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { VoiceStatus } from '../../types';

// ============================================================
// Voice Service — Works in both Expo Go and APK
// Recording: expo-av (no native modules needed)
// STT: Google Cloud REST API (optional)
// TTS: expo-speech (free, built-in)
// ============================================================

type PartialCallback = (text: string) => void;
type FinalCallback = (text: string) => void;
type ErrorCallback = (error: string) => void;

class VoiceService {
  private recording: Audio.Recording | null = null;
  private onStatusChange?: (status: VoiceStatus) => void;

  setStatusCallback(cb: (status: VoiceStatus) => void) {
    this.onStatusChange = cb;
  }

  private setStatus(s: VoiceStatus) { this.onStatusChange?.(s); }

  async startRecording(
    onPartial?: PartialCallback,
    onFinal?: FinalCallback,
    onError?: ErrorCallback
  ): Promise<void> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        onError?.('মাইক্রোফোন অনুমতি দিন');
        throw new Error('মাইক্রোফোন অনুমতি দিন');
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      if (this.recording) {
        try { await this.recording.stopAndUnloadAsync(); } catch {}
        this.recording = null;
      }

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      this.setStatus('listening');

      // Store callbacks for use in stopRecording
      (this as any)._onFinal = onFinal;
      (this as any)._onError = onError;
    } catch (err: any) {
      this.setStatus('error');
      onError?.(err.message ?? 'মাইক্রোফোন চালু করা যায়নি');
      throw err;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.recording) return;
    this.setStatus('processing');

    const onFinal = (this as any)._onFinal as FinalCallback | undefined;
    const onError = (this as any)._onError as ErrorCallback | undefined;

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (!uri) {
        onFinal?.('');
        return;
      }

      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_STT_API_KEY;
      if (apiKey && apiKey.length > 10) {
        const result = await this.transcribeWithGoogle(uri, apiKey);
        onFinal?.(result);
      } else {
        // No API key — return empty so text modal opens
        onFinal?.('');
      }
    } catch (err: any) {
      onError?.(err.message);
      onFinal?.('');
    } finally {
      this.setStatus('idle');
    }
  }

  async cancelRecording(): Promise<void> {
    if (this.recording) {
      try { await this.recording.stopAndUnloadAsync(); } catch {}
      this.recording = null;
    }
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch {}
    this.setStatus('idle');
  }

  private async transcribeWithGoogle(uri: string, apiKey: string): Promise<string> {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const body = {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 44100,
          languageCode: 'bn-BD',
          alternativeLanguageCodes: ['bn-IN'],
          speechContexts: [{
            phrases: [
              'চাল','ডাল','তেল','সয়াবিন','চিনি','লবণ','পেঁয়াজ',
              'আলু','ময়দা','ডিম','দুধ','মাছ','মাংস',
              'বিক্রি','কিনলাম','বেচলাম','কেজি','লিটার','টাকা',
              'এক','দুই','তিন','চার','পাঁচ','দশ','একশো','পাঁচশো',
            ],
            boost: 20,
          }],
        },
        audio: { content: base64 },
      };

      const res = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      const data = await res.json();
      return data.results?.[0]?.alternatives?.[0]?.transcript ?? '';
    } catch {
      return '';
    }
  }

  async speak(text: string, onDone?: () => void): Promise<void> {
    try {
      await Speech.stop();
      await Speech.speak(text, { language: 'bn-BD', pitch: 1.0, rate: 0.85, onDone });
    } catch {}
  }

  async stopSpeaking(): Promise<void> {
    try { await Speech.stop(); } catch {}
  }
}

export const voiceService = new VoiceService();
