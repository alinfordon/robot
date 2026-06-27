"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function voiceLangPrefix(lang: string): string {
  return lang.split("-")[0].toLowerCase();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined") return undefined;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return undefined;

  const prefix = voiceLangPrefix(lang);
  return (
    voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => voiceLangPrefix(v.lang.replace("_", "-")) === prefix) ??
    undefined
  );
}

export function useSpeech() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const load = () => setVoicesReady(window.speechSynthesis.getVoices().length > 0);
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const speak = useCallback(
    (text: string, lang = "ro-RO"): Promise<void> => {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve();
          return;
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 1;

        const voice = pickVoice(lang);
        if (voice) utterance.voice = voice;

        utteranceRef.current = utterance;

        const finish = () => {
          setIsSpeaking(false);
          resolve();
        };

        utterance.onend = finish;
        utterance.onerror = finish;

        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      });
    },
    []
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  return { speak, stop, isSpeaking, isSupported, voicesReady };
}
