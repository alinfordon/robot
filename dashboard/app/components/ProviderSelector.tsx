"use client";

import { Provider } from "@/app/types/robot";
import { useProviders } from "@/app/hooks/useProviders";
import { useEffect } from "react";

interface ProviderSelectorProps {
  selected: Provider;
  onSelect: (p: Provider) => void;
  compact?: boolean;
}

export default function ProviderSelector({ selected, onSelect, compact }: ProviderSelectorProps) {
  const { providers, activeProvider } = useProviders();

  useEffect(() => {
    if (activeProvider) {
      document.documentElement.style.setProperty("--accent", activeProvider.color);
    }
  }, [activeProvider]);

  if (compact) {
    return (
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {providers.map((p) => (
          <button
            key={p.id}
            className={`btn ${selected === p.id ? "btn-active" : ""}`}
            style={{
              padding: "4px 10px",
              fontSize: "0.7rem",
              opacity: p.available ? 1 : 0.4,
              borderColor: p.color,
            }}
            onClick={() => p.available && onSelect(p.id)}
            disabled={!p.available}
          >
            {p.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {providers.map((p) => (
        <button
          key={p.id}
          className={`btn ${selected === p.id ? "btn-active" : ""}`}
          style={{
            padding: "12px",
            opacity: p.available ? 1 : 0.4,
            borderColor: selected === p.id ? p.color : undefined,
          }}
          onClick={() => p.available && onSelect(p.id)}
          disabled={!p.available}
        >
          <div style={{ fontWeight: 600, color: p.color }}>{p.name}</div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4 }}>{p.model}</div>
          <div style={{ fontSize: "0.6rem", marginTop: 4 }}>
            {p.available ? "● Online" : "○ Offline"}
          </div>
        </button>
      ))}
    </div>
  );
}
