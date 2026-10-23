"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VolumePanelProps {
  volume: number;
  connected?: boolean;
  onChange: (volume: number) => Promise<void>;
  /** Trimite direct pe WS ca backup daca HTTP sync esueaza */
  sendCommand?: (type: string, payload?: Record<string, unknown>) => boolean;
}

export default function VolumePanel({ volume, connected, onChange, sendCommand }: VolumePanelProps) {
  const safeVolume = Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 80;
  const [local, setLocal] = useState(safeVolume);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(safeVolume);
  }, [safeVolume]);

  const persist = useCallback(
    async (next: number) => {
      setBusy(true);
      setError(null);
      // Direct pe WebSocket — ajunge la robot chiar daca API-ul HTTP greseste portul
      sendCommand?.("SET_VOLUME", { volume: next, source: "dashboard_ws" });
      try {
        const res = await fetch("/api/settings/volume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ volume: next }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Eroare salvare volum");
        await onChange(Number(data.volume));
        if (!data.synced && !connected) {
          setError("Salvat local; robot offline — se aplica la reconectare.");
        }
      } catch (e) {
        setError(String(e));
        await onChange(next);
      } finally {
        setBusy(false);
      }
    },
    [onChange, sendCommand, connected]
  );

  const onSlide = (value: number) => {
    setLocal(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(value);
    }, 250);
  };

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div
        className="panel-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <span>Volum vorbire (TTS)</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
          {local}%{busy ? "…" : ""}
        </span>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
        TTS pe MAX98357 — curbă agresivă (50 ≈ mult mai încet). 0 = mut. Încearcă 20–35 dacă e prea tare.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          className="btn"
          style={{ minWidth: 44 }}
          disabled={busy}
          onClick={() => onSlide(local === 0 ? 80 : 0)}
          title={local === 0 ? "Unmute" : "Mute"}
        >
          {local === 0 ? "unmute" : "mute"}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={local}
          disabled={busy}
          onChange={(e) => onSlide(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
      </div>

      {!connected && (
        <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          robot offline — volumul se aplică la reconectare
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--warning)", fontFamily: "var(--font-mono)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
