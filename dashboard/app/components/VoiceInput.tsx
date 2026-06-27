"use client";

import { MicrophoneSource } from "@/app/hooks/useAudioSettings";

interface VoiceInputProps {
  microphoneSource: MicrophoneSource;
  robotConnected: boolean;
  isVoiceActive: boolean;
  isListening: boolean;
  isPausedForTts: boolean;
  interimText: string;
  micError: string | null;
  pcMicSupported: boolean;
  disabled?: boolean;
  onTogglePcMic: () => void;
  onToggleRobotMic: () => void;
}

export default function VoiceInput({
  microphoneSource,
  robotConnected,
  isVoiceActive,
  isListening,
  isPausedForTts,
  interimText,
  micError,
  pcMicSupported,
  disabled,
  onTogglePcMic,
  onToggleRobotMic,
}: VoiceInputProps) {
  const isPc = microphoneSource === "pc";
  const canUsePc = isPc && pcMicSupported;
  const canUseRobot = !isPc && robotConnected;

  if (isPc) {
    return (
      <div className="voice-input">
        <button
          type="button"
          className={`btn voice-btn ${isVoiceActive ? "btn-active voice-btn-live" : ""}`}
          disabled={disabled || !canUsePc}
          onClick={onTogglePcMic}
          title="Click pentru activare / dezactivare microfon"
        >
          {isVoiceActive ? "● Ody ascultă" : "🎤 Vorbește"}
        </button>
        {canUsePc ? (
          <span className="voice-hint">
            {isVoiceActive
              ? isPausedForTts
                ? "Robot vorbește — microfon oprit temporar"
                : isListening
                  ? "Click din nou pentru a opri"
                  : "Pornesc microfonul..."
              : "Click pentru a activa microfonul PC"}
          </span>
        ) : (
          <span className="voice-hint">Folosește Chrome sau Edge pentru microfon PC</span>
        )}
        {micError && (
          <p className="voice-error">{micError}</p>
        )}
        {interimText && isVoiceActive && (
          <p className="voice-interim">&ldquo;{interimText}&rdquo;</p>
        )}
      </div>
    );
  }

  return (
    <div className="voice-input">
      <button
        type="button"
        className={`btn voice-btn ${isVoiceActive ? "btn-active voice-btn-live" : ""}`}
        disabled={disabled || !canUseRobot}
        onClick={onToggleRobotMic}
        title="Click pentru activare / dezactivare microfon Pi"
      >
        {isVoiceActive ? "● Ody ascultă (Pi)" : "🎤 Vorbește (Pi)"}
      </button>
      <span className="voice-hint">
        {!canUseRobot
          ? "Conectează robotul pentru microfon Pi"
          : isVoiceActive
            ? isPausedForTts
              ? "Robot vorbește — așteaptă..."
              : "Vorbește lângă robot — click pentru oprire"
            : "Click pentru a asculta pe Pi"}
      </span>
    </div>
  );
}
