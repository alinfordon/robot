"use client";

import { AudioSettings as AudioSettingsType, MicrophoneSource } from "@/app/hooks/useAudioSettings";

interface AudioSettingsProps {
  settings: AudioSettingsType;
  onChange: (patch: Partial<AudioSettingsType>) => void;
  robotConnected: boolean;
  context?: "chat" | "translator";
}

function MicOption({
  name,
  value,
  current,
  disabled,
  onChange,
  label,
  hint,
}: {
  name: string;
  value: MicrophoneSource;
  current: MicrophoneSource;
  disabled?: boolean;
  onChange: (v: MicrophoneSource) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className={`audio-mic-option ${disabled ? "disabled" : ""}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </label>
  );
}

export default function AudioSettings({
  settings,
  onChange,
  robotConnected,
  context = "chat",
}: AudioSettingsProps) {
  const isTranslator = context === "translator";

  return (
    <div className="audio-settings">
      <div className="panel-title" style={{ marginBottom: 6 }}>
        Audio
      </div>

      <div className="audio-settings-section">
        <div className="audio-settings-label">
          {isTranslator ? "Microfon traducător" : "Microfon chat vocal"}
        </div>
        <MicOption
          name={`mic-source-${context}`}
          value="pc"
          current={settings.microphoneSource}
          onChange={(v) => onChange({ microphoneSource: v })}
          label="PC (browser)"
          hint="Recunoaștere vocală în Chrome/Edge"
        />
        <MicOption
          name={`mic-source-${context}`}
          value="robot"
          current={settings.microphoneSource}
          disabled={!robotConnected}
          onChange={(v) => onChange({ microphoneSource: v })}
          label="Raspberry Pi (Vosk)"
          hint={robotConnected ? "Vorbește lângă robot" : "Robot neconectat"}
        />
      </div>

      <label className="audio-toggle">
        <input
          type="checkbox"
          checked={settings.robotTtsOnChat}
          onChange={(e) => onChange({ robotTtsOnChat: e.target.checked })}
          disabled={!robotConnected}
        />
        <span>{isTranslator ? "TTS pe robot (traducere)" : "TTS pe robot (la chat dashboard)"}</span>
      </label>
      <label className="audio-toggle">
        <input
          type="checkbox"
          checked={settings.pcTtsEnabled}
          onChange={(e) => onChange({ pcTtsEnabled: e.target.checked })}
        />
        <span>{isTranslator ? "TTS pe PC (traducere)" : "TTS pe PC (browser)"}</span>
      </label>
      {!isTranslator && (
        <p className="audio-settings-hint">
          Răspunsurile vocale de pe Pi nu sunt redate pe PC (spoken_on_robot).
        </p>
      )}
    </div>
  );
}
