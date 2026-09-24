import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants';

// Same optional-dependency pattern the app already used for voice — the
// module may not be present in every build.
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = (_event: string, _cb: any) => {};
try {
  const mod = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {}

interface Props {
  /** Called once with the final transcript. The caller decides what to do with it — e.g. `setName(text)`. */
  onResult: (text: string) => void;
  lang?: string;
  size?: number;
  style?: any;
}

/**
 * Voice, scoped down to what it's actually reliable for: dictating a single
 * short field (a product name), not parsing a whole sale. Full-sentence
 * voice-to-sale entry was removed from the POS screen (pronunciation and
 * alias matching against a live transaction was too unreliable) — this is
 * what replaced it, used from the product-creation forms:
 * app/(tabs)/inventory.tsx's ProductModal, app/barcode-scanner.tsx's
 * new-product form, and app/(tabs)/home.tsx's quick new-product modal.
 */
export default function VoiceDictationButton({ onResult, lang = 'bn-BD', size = 20, style }: Props) {
  const [listening, setListening] = useState(false);
  const available = ExpoSpeechRecognitionModule !== null;

  useSpeechRecognitionEvent('result', (event: any) => {
    if (!listening) return;
    const transcript = event.results?.[0]?.transcript ?? '';
    if (!event.isFinal) return;
    setListening(false);
    if (transcript.trim()) onResult(transcript.trim());
  });

  useSpeechRecognitionEvent('error', () => setListening(false));
  useSpeechRecognitionEvent('end', () => setListening(false));

  const toggle = async () => {
    if (!available) return;
    if (listening) {
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
      setListening(false);
      return;
    }
    try {
      const granted = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted.granted) return;
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang, interimResults: true, maxAlternatives: 1, continuous: true });
    } catch {
      setListening(false);
    }
  };

  if (!available) return null; // no mic hardware/module — the text field alone still works

  return (
    <TouchableOpacity
      onPress={toggle}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.btn, listening && styles.btnActive, style]}
      activeOpacity={0.75}
    >
      <Ionicons name={listening ? 'stop' : 'mic'} size={size} color={listening ? '#fff' : COLORS.primary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surfaceSecondary,
  },
  btnActive: { backgroundColor: COLORS.error },
});
