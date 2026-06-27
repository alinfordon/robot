"use client";

import { useState, useRef, useEffect } from "react";
import { Message, OllamaModelMode, Provider, RobotStatus } from "@/app/types/robot";
import { AudioSettings as AudioSettingsType, MicrophoneSource } from "@/app/hooks/useAudioSettings";
import ProviderSelector from "./ProviderSelector";
import OllamaModelSelector from "./OllamaModelSelector";
import AudioSettings from "./AudioSettings";
import VoiceInput from "./VoiceInput";

interface VoiceInputState {
  microphoneSource: MicrophoneSource;
  isVoiceActive: boolean;
  isListening: boolean;
  isPausedForTts: boolean;
  interimText: string;
  micError: string | null;
  pcMicSupported: boolean;
  onTogglePcMic: () => void;
  onToggleRobotMic: () => void;
}

interface ChatAreaProps {
  messages: Message[];
  typing: boolean;
  robotStatus: RobotStatus;
  audioSettings: AudioSettingsType;
  onAudioSettingsChange: (patch: Partial<AudioSettingsType>) => void;
  provider: Provider;
  onProviderChange: (provider: Provider) => void;
  ollamaMode: OllamaModelMode;
  onOllamaModeChange: (mode: OllamaModelMode) => void;
  voiceInput: VoiceInputState;
  onSend: (text: string, provider: Provider) => Promise<void>;
}

export default function ChatArea({
  messages,
  typing,
  robotStatus,
  audioSettings,
  onAudioSettingsChange,
  provider,
  onProviderChange,
  ollamaMode,
  onOllamaModeChange,
  voiceInput,
  onSend,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await onSend(input.trim(), provider);
      setInput("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="panel chat-panel">
      <div className="panel-title">Conversație ROBO_V1</div>
      <AudioSettings
        settings={audioSettings}
        onChange={onAudioSettingsChange}
        robotConnected={robotStatus.connected}
      />
      <ProviderSelector selected={provider} onSelect={onProviderChange} compact />
      {provider === "ollama" && (
        <OllamaModelSelector mode={ollamaMode} onChange={onOllamaModeChange} />
      )}
      <VoiceInput
        microphoneSource={voiceInput.microphoneSource}
        robotConnected={robotStatus.connected}
        isVoiceActive={voiceInput.isVoiceActive}
        isListening={voiceInput.isListening}
        isPausedForTts={voiceInput.isPausedForTts}
        interimText={voiceInput.interimText}
        micError={voiceInput.micError}
        pcMicSupported={voiceInput.pcMicSupported}
        disabled={sending || typing}
        onTogglePcMic={voiceInput.onTogglePcMic}
        onToggleRobotMic={voiceInput.onToggleRobotMic}
      />
      <div className="scroll-y" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {messages.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", textAlign: "center", marginTop: 20 }}>
            Vorbește cu robotul sau scrie un mesaj...
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: 8,
              background: msg.role === "user" ? "var(--accent-dim)" : "var(--bg)",
              border: `1px solid ${msg.role === "user" ? "var(--accent)" : "var(--border)"}`,
              fontSize: "0.875rem",
            }}
          >
            <div>{msg.content}</div>
            {msg.provider && (
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                {msg.provider} · {msg.model}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", fontStyle: "italic" }}>
            ROBO_V1 gândește...
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Scrie un mesaj..."
          style={{ flex: 1 }}
          disabled={sending}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
          Trimite
        </button>
      </form>
    </div>
  );
}
