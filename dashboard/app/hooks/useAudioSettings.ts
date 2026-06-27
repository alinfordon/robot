"use client";

import { useCallback, useEffect, useState } from "react";

export type MicrophoneSource = "pc" | "robot";

export interface AudioSettings {
  /** Browser speechSynthesis on PC */
  pcTtsEnabled: boolean;
  /** Send SPEAK to robot when chatting from dashboard */
  robotTtsOnChat: boolean;
  /** Microphone used for voice chat in dashboard */
  microphoneSource: MicrophoneSource;
}

const STORAGE_KEY = "robo-v1-audio-settings";

const DEFAULT_SETTINGS: AudioSettings = {
  pcTtsEnabled: false,
  robotTtsOnChat: true,
  microphoneSource: "pc",
};

function loadSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useAudioSettings() {
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const updateSettings = useCallback((patch: Partial<AudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
