"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "@/app/hooks/useSpeechRecognition";
import { useSpeech } from "@/app/hooks/useSpeech";
import { AudioSettings as AudioSettingsType } from "@/app/hooks/useAudioSettings";
import AudioSettings from "@/app/components/AudioSettings";
import VoiceInput from "@/app/components/VoiceInput";
import { oppositeLang, type BilingualLang } from "@/lib/translate/detectLang";

interface TranslatorEntry {
  id: number;
  speaker: BilingualLang;
  translated: string;
  original: string;
  timestamp: Date;
}

interface SpeechEvent {
  id: number;
  text: string;
  route: string;
}

interface BilingualTranslatorProps {
  robotConnected: boolean;
  robotSpeaking: boolean;
  lastSpeechRecognized: SpeechEvent | null;
  sendCommand: (type: string, payload?: Record<string, unknown>) => boolean;
  robotSpeak: (text: string, lang?: BilingualLang) => void;
  audioSettings: AudioSettingsType;
  onAudioSettingsChange: (patch: Partial<AudioSettingsType>) => void;
}

/** PC: un singur STT ro-RO stabil; limba traducerii se detectează din text. */
const STT_PC = { continuous: true, interimSilenceMs: 1800 } as const;

const LANG_META: Record<
  BilingualLang,
  { label: string; flag: string; ttsLocale: string }
> = {
  ro: { label: "Română", flag: "🇷🇴", ttsLocale: "ro-RO" },
  en: { label: "English", flag: "🇬🇧", ttsLocale: "en-US" },
};

export default function BilingualTranslator({
  robotConnected,
  robotSpeaking,
  lastSpeechRecognized,
  sendCommand,
  robotSpeak,
  audioSettings,
  onAudioSettingsChange,
}: BilingualTranslatorProps) {
  const voiceGate = useSpeechRecognition("ro-RO", STT_PC);
  const pcSpeech = useSpeechRecognition("ro-RO", STT_PC);
  const { speak: browserSpeak, isSpeaking: browserSpeaking, stop: stopSpeech } = useSpeech();

  const [entries, setEntries] = useState<TranslatorEntry[]>([]);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [manualText, setManualText] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "translating" | "speaking">("idle");
  const [error, setError] = useState<string | null>(null);
  const entryId = useRef(0);
  const lastHandledSpeechId = useRef<number | null>(null);
  const piSttLang = useRef<BilingualLang>("ro");
  const bottomRef = useRef<HTMLDivElement>(null);

  const useRobotMic = audioSettings.microphoneSource === "robot";
  const isVoiceActive = useRobotMic ? voiceGate.isVoiceActive : pcSpeech.isVoiceActive;
  const isOutputActive = robotSpeaking || browserSpeaking;
  const micPaused = busy || phase !== "idle" || isOutputActive;

  const setRobotStt = useCallback(
    (enabled: boolean, lang: BilingualLang = piSttLang.current) => {
      if (!robotConnected) return;
      sendCommand("SET_STT_CONFIG", { enabled, route: "translator", lang });
    },
    [robotConnected, sendCommand]
  );

  useEffect(() => {
    if (!robotConnected) return;
    setRobotStt(useRobotMic, piSttLang.current);
  }, [useRobotMic, robotConnected, setRobotStt]);

  const prevUseRobotMic = useRef(useRobotMic);
  useEffect(() => {
    if (prevUseRobotMic.current === useRobotMic) return;
    prevUseRobotMic.current = useRobotMic;
    pcSpeech.deactivate();
    voiceGate.deactivate();
  }, [useRobotMic]);

  // Pauză mic PC cât timp traduce/redă — fără repornire prematură
  useEffect(() => {
    if (useRobotMic) return;
    if (micPaused) {
      pcSpeech.pauseForTts();
    } else if (pcSpeech.isVoiceActive) {
      pcSpeech.resumeAfterTts();
    }
  }, [micPaused, useRobotMic, pcSpeech.isVoiceActive, pcSpeech.pauseForTts, pcSpeech.resumeAfterTts]);

  const speakTranslation = useCallback(
    async (text: string, targetLang: BilingualLang) => {
      const voice = LANG_META[targetLang];
      setPhase("speaking");

      if (audioSettings.robotTtsOnChat && robotConnected) {
        robotSpeak(text, targetLang);
        return;
      }
      if (audioSettings.pcTtsEnabled) {
        await browserSpeak(text, voice.ttsLocale);
      }
    },
    [audioSettings.pcTtsEnabled, audioSettings.robotTtsOnChat, browserSpeak, robotConnected, robotSpeak]
  );

  const translateAndAppend = useCallback(
    async (original: string) => {
      setBusy(true);
      setPhase("translating");
      setError(null);

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: original, from: "auto" }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Traducere eșuată.");
          setPhase("idle");
          return;
        }

        const from = (data.from as BilingualLang) || "ro";
        const to = (data.to as BilingualLang) || oppositeLang(from);
        piSttLang.current = from;

        if (useRobotMic && robotConnected) {
          setRobotStt(true, from);
        }

        entryId.current += 1;
        setEntries((prev) => [
          ...prev,
          {
            id: entryId.current,
            speaker: from,
            original,
            translated: data.translated,
            timestamp: new Date(),
          },
        ]);

        if (autoSpeak && data.translated) {
          await speakTranslation(data.translated, to);
        }
      } catch {
        setError("Eroare de rețea la traducere.");
      } finally {
        setBusy(false);
        setPhase("idle");
      }
    },
    [autoSpeak, speakTranslation, useRobotMic, robotConnected, setRobotStt]
  );

  const handlePhrase = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      void translateAndAppend(trimmed);
    },
    [busy, translateAndAppend]
  );

  useEffect(() => {
    if (!useRobotMic || !voiceGate.isVoiceActive) return;
    if (robotSpeaking) return;
    const speech = lastSpeechRecognized;
    if (!speech || speech.id === lastHandledSpeechId.current) return;
    if (speech.route !== "translator") return;

    lastHandledSpeechId.current = speech.id;
    const text = speech.text.trim();
    if (text) handlePhrase(text);
  }, [useRobotMic, voiceGate.isVoiceActive, lastSpeechRecognized, robotSpeaking, handlePhrase]);

  useEffect(() => {
    pcSpeech.setOnChatMessage((text) => {
      if (!useRobotMic && pcSpeech.isVoiceActive && text.trim()) {
        handlePhrase(text.trim());
      }
    });
  }, [useRobotMic, pcSpeech.setOnChatMessage, pcSpeech.isVoiceActive, handlePhrase]);

  useEffect(() => {
    return () => {
      voiceGate.deactivate();
      pcSpeech.deactivate();
      sendCommand("SET_STT_CONFIG", { enabled: false, route: "translator", lang: "auto" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const handleManualSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim() || busy) return;
    handlePhrase(manualText.trim());
    setManualText("");
  };

  const lastDetected = entries.length > 0 ? entries[entries.length - 1].speaker : null;

  return (
    <div className="panel translator-panel">
      <div className="translator-header">
        <div className="panel-title" style={{ margin: 0 }}>
          Traducător live RO ↔ EN
        </div>
        <label className="translator-toggle">
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
          Citește traducerea automat
        </label>
      </div>

      <AudioSettings
        settings={audioSettings}
        onChange={onAudioSettingsChange}
        robotConnected={robotConnected}
        context="translator"
      />

      <VoiceInput
        microphoneSource={audioSettings.microphoneSource}
        robotConnected={robotConnected}
        isVoiceActive={isVoiceActive}
        isListening={useRobotMic ? false : pcSpeech.isListening}
        isPausedForTts={useRobotMic ? robotSpeaking : pcSpeech.isPausedForTts}
        interimText={useRobotMic ? "" : pcSpeech.interimText}
        micError={useRobotMic ? voiceGate.micError : pcSpeech.micError}
        pcMicSupported={pcSpeech.isSupported}
        onTogglePcMic={pcSpeech.toggleVoiceActive}
        onToggleRobotMic={voiceGate.toggleRobotVoiceGate}
      />

      <p className="translator-status">
        Detectare automată 🇷🇴 ↔ 🇬🇧
        {lastDetected && (
          <>
            {" · "}
            Ultima: {LANG_META[lastDetected].flag} → {LANG_META[oppositeLang(lastDetected)].flag}
          </>
        )}
        {" · "}
        Mic: {useRobotMic ? "Pi (Vosk)" : "PC (browser, RO)"}
        {phase === "translating" && " · Traduc..."}
        {phase === "speaking" && " · Redare..."}
        {isOutputActive && phase === "idle" && " · Redare..."}
      </p>

      {error && <p className="translator-error">{error}</p>}

      <div className="translator-log scroll-y">
        {entries.length === 0 && (
          <p className="translator-empty">
            Apasă 🎤 Vorbește și spune o frază în română sau engleză — limba se detectează singură.
          </p>
        )}
        {entries.map((entry) => {
          const meta = LANG_META[entry.speaker];
          const other = LANG_META[oppositeLang(entry.speaker)];
          return (
            <div key={entry.id} className="translator-entry">
              <div className="translator-entry-meta">
                {meta.flag} → {other.flag}
                <span>{entry.timestamp.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="translator-original">{entry.original}</div>
              <div className="translator-translated">{entry.translated}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {audioSettings.robotTtsOnChat && robotConnected && (
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                    onClick={() => robotSpeak(entry.translated, oppositeLang(entry.speaker))}
                  >
                    🔊 Pi ({oppositeLang(entry.speaker) === "en" ? "EN" : "RO"})
                  </button>
                )}
                {audioSettings.pcTtsEnabled && (
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                    onClick={() => void browserSpeak(entry.translated, other.ttsLocale)}
                  >
                    🔊 PC ({oppositeLang(entry.speaker) === "en" ? "EN" : "RO"})
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="translator-manual" onSubmit={(e) => void handleManualSend(e)}>
        <input
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Sau scrie manual o frază (RO sau EN)..."
          disabled={busy}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !manualText.trim()}>
          Traduce
        </button>
      </form>

      {browserSpeaking && (
        <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => stopSpeech()}>
          Oprește vocea PC
        </button>
      )}
    </div>
  );
}
