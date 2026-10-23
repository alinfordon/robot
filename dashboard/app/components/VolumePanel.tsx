"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VolumePanelProps {
  volume: number;
  connected?: boolean;
  onChange: (volume: number) => Promise<void>;
}

export default function VolumePanel({ volume, connected, onChange }: VolumePanelProps) {
  const [local, setLocal] = useState(volume);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(volume);
  }, [volume]);

  const persist = useCallback(
    async (next: number) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/settings/volume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ volume: next }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Eroare salvare volum");
        await onChange(Number(data.volume));
        if (!data.synced) {
          setError("Salvat, dar robotul nu e conectat.");
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [onChange]
  );

  const onSlide = (value: number) => {
    setLocal(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(value);
    }, 250);
  };

  return (
    <div className="panel" style={{ marginTop: 8 }}>
      <div
        className="panel-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <span>Volum vorbire</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
          {local}%{busy ? "…" : ""}
        </span>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Controlează TTS pe MAX98357 (0 = mut). Se salvează în MongoDB și se trimite la robot.
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
