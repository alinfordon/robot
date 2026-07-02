"use client";

import { useCallback, useState } from "react";

interface AiNavigatePanelProps {
  enabled: boolean;
  connected?: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}

export default function AiNavigatePanel({ enabled, connected, onChange }: AiNavigatePanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = !enabled;
      const res = await fetch("/api/settings/ai-navigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eroare salvare");
      await onChange(Boolean(data.enabled));
      if (next && !data.synced) {
        setError("Salvat în DB, dar robotul nu e conectat.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [enabled, onChange]);

  return (
    <div className="panel" style={{ marginTop: 8 }}>
      <div
        className="panel-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <span>Navigare AI continuă</span>
        <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", fontWeight: 400 }}>
          {!connected ? (
            <span style={{ color: "var(--text-muted)" }}>robot offline</span>
          ) : enabled ? (
            <span style={{ color: "var(--success)" }}>ACTIV</span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>oprit</span>
          )}
        </span>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Robotul analizează senzorii la fiecare ~4s și alege direcția cu AI (Ollama). Starea se salvează în MongoDB.
      </p>

      <button
        className={`btn ${enabled ? "btn-active" : ""}`}
        disabled={busy || !connected}
        onClick={() => void toggle()}
        style={{ width: "100%", textTransform: "uppercase", fontSize: "0.8rem" }}
      >
        {busy ? "..." : enabled ? "Oprește navigare AI" : "Pornește navigare AI"}
      </button>

      {error && (
        <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--warning)", fontFamily: "var(--font-mono)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
