"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "Permisiune microfon refuzată — verifică setările browserului",
  "service-not-allowed": "Microfon blocat (folosește HTTPS sau localhost)",
  "no-speech": "Nu am auzit nimic — vorbește mai aproape de microfon",
  "audio-capture": "Microfon indisponibil — verifică dispozitivul",
  "network": "Eroare rețea la recunoaștere vocală",
};

export interface SpeechRecognitionOptions {
  /** false = finalizează fraza mai repede (traducător) */
  continuous?: boolean;
  /** Trimite fraza după N ms fără schimbare la text interimar (0 = dezactivat) */
  interimSilenceMs?: number;
}

export function useSpeechRecognition(lang = "ro-RO", options: SpeechRecognitionOptions = {}) {
  const continuous = options.continuous ?? true;
  const interimSilenceMs = options.interimSilenceMs ?? 0;

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldListenRef = useRef(false);
  const isVoiceActiveRef = useRef(false);
  const pausedForTtsRef = useRef(false);
  const interimTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSubmittedRef = useRef("");
  const phraseBufferRef = useRef("");

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPausedForTts, setIsPausedForTts] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const interimSilenceMsRef = useRef(interimSilenceMs);
  interimSilenceMsRef.current = interimSilenceMs;

  const onChatRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    setIsSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  const setOnChatMessage = useCallback((handler: (text: string) => void) => {
    onChatRef.current = handler;
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
    phraseBufferRef.current = "";
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimText("");
  }, []);

  const resetPhraseState = useCallback(() => {
    phraseBufferRef.current = "";
    lastSubmittedRef.current = "";
    if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
  }, []);

  const submitPhrase = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === lastSubmittedRef.current) return;
    lastSubmittedRef.current = trimmed;
    phraseBufferRef.current = "";
    setInterimText("");
    setMicError(null);
    onChatRef.current(trimmed);
    window.setTimeout(() => {
      if (lastSubmittedRef.current === trimmed) lastSubmittedRef.current = "";
    }, 3000);

    if (interimSilenceMsRef.current && isVoiceActiveRef.current && !pausedForTtsRef.current) {
      shouldListenRef.current = true;
      recognitionRef.current?.abort();
    }
  }, []);

  const scheduleInterimSubmit = useCallback(
    (interim: string) => {
      if (!interimSilenceMs || !interim.trim()) return;
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      interimTimerRef.current = setTimeout(() => {
        submitPhrase(interim);
      }, interimSilenceMs);
    },
    [interimSilenceMs, submitPhrase]
  );

  const deactivate = useCallback(() => {
    isVoiceActiveRef.current = false;
    pausedForTtsRef.current = false;
    setIsVoiceActive(false);
    setIsPausedForTts(false);
    stopListening();
  }, [stopListening]);

  const attachRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || !shouldListenRef.current || !isVoiceActiveRef.current) return;

    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!isVoiceActiveRef.current || pausedForTtsRef.current) return;

      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) {
          finalText += (finalText ? " " : "") + transcript;
        } else {
          interim += (interim ? " " : "") + transcript;
        }
      }

      if (finalText) {
        phraseBufferRef.current = phraseBufferRef.current
          ? `${phraseBufferRef.current} ${finalText}`.trim()
          : finalText;
      }

      const combined = [phraseBufferRef.current, interim].filter(Boolean).join(" ").trim();

      if (combined) {
        setInterimText(combined);
        if (interimSilenceMs) {
          scheduleInterimSubmit(combined);
        }
      }

      if (finalText && !interimSilenceMs) {
        if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
        submitPhrase(finalText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted") return;
      const message = MIC_ERRORS[event.error] ?? `Eroare microfon: ${event.error}`;
      setMicError(message);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        isVoiceActiveRef.current = false;
        setIsVoiceActive(false);
        shouldListenRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current && isVoiceActiveRef.current && !pausedForTtsRef.current) {
        window.setTimeout(() => {
          if (shouldListenRef.current && isVoiceActiveRef.current && !pausedForTtsRef.current) {
            attachRecognition();
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      setMicError(null);
    } catch {
      window.setTimeout(() => {
        if (shouldListenRef.current && isVoiceActiveRef.current) {
          attachRecognition();
        }
      }, 400);
    }
  }, [lang, continuous, scheduleInterimSubmit, submitPhrase]);

  const startListening = useCallback(() => {
    if (!getSpeechRecognitionCtor()) return false;
    shouldListenRef.current = true;
    attachRecognition();
    return true;
  }, [attachRecognition]);

  const pauseForTts = useCallback(() => {
    if (!isVoiceActiveRef.current || pausedForTtsRef.current) return;
    pausedForTtsRef.current = true;
    setIsPausedForTts(true);
    shouldListenRef.current = false;
    if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
    phraseBufferRef.current = "";
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimText("");
  }, []);

  const resumeAfterTts = useCallback(() => {
    if (!isVoiceActiveRef.current || !pausedForTtsRef.current) return;
    pausedForTtsRef.current = false;
    setIsPausedForTts(false);
    shouldListenRef.current = true;
    resetPhraseState();
    attachRecognition();
  }, [attachRecognition, resetPhraseState]);

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      setMicError(MIC_ERRORS["not-allowed"]);
      return false;
    }
  }, []);

  const activate = useCallback(async () => {
    setMicError(null);
    resetPhraseState();
    isVoiceActiveRef.current = true;
    setIsVoiceActive(true);

    const allowed = await requestMicPermission();
    if (!allowed) {
      isVoiceActiveRef.current = false;
      setIsVoiceActive(false);
      return;
    }

    startListening();
  }, [requestMicPermission, startListening, resetPhraseState]);

  const toggleVoiceActive = useCallback(() => {
    if (isVoiceActiveRef.current) {
      deactivate();
    } else {
      void activate();
    }
  }, [activate, deactivate]);

  const toggleRobotVoiceGate = useCallback(() => {
    setIsVoiceActive((prev) => {
      const next = !prev;
      isVoiceActiveRef.current = next;
      if (!next) setInterimText("");
      return next;
    });
    setMicError(null);
  }, []);

  useEffect(() => () => deactivate(), [deactivate]);

  return {
    isVoiceActive,
    isListening,
    isPausedForTts,
    interimText,
    micError,
    isSupported,
    setOnChatMessage,
    toggleVoiceActive,
    toggleRobotVoiceGate,
    activate,
    deactivate,
    pauseForTts,
    resumeAfterTts,
    setVoiceActive: setIsVoiceActive,
  };
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}
