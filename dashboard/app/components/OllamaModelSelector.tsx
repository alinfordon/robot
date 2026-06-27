"use client";

import { OllamaModelMode } from "@/app/types/robot";

interface OllamaModelSelectorProps {
  mode: OllamaModelMode;
  onChange: (mode: OllamaModelMode) => void;
}

const MODES: { id: OllamaModelMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "aya conversație · qwen control" },
  { id: "chat", label: "Chat", hint: "aya:8b" },
  { id: "control", label: "Control", hint: "qwen2.5:7b" },
];

export default function OllamaModelSelector({ mode, onChange }: OllamaModelSelectorProps) {
  return (
    <div className="ollama-model-row">
      <span className="ollama-model-label">Model Ollama</span>
      <div className="ollama-model-btns">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`btn ${mode === m.id ? "btn-active" : ""}`}
            style={{ padding: "4px 10px", fontSize: "0.7rem" }}
            onClick={() => onChange(m.id)}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
