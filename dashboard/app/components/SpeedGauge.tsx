"use client";

import { EncoderMeta } from "@/app/types/robot";

interface SpeedGaugeProps {
  speedCmS: number;
  connected?: boolean;
  meta?: EncoderMeta;
}

export default function SpeedGauge({ speedCmS, connected, meta }: SpeedGaugeProps) {
  const active = (meta?.active.length ?? 0) > 0;
  const moving = connected && active && Math.abs(speedCmS) > 0.5;

  return (
    <div className="panel">
      <div className="panel-title">Speed</div>
      <div style={{ textAlign: "center", padding: "16px 8px" }}>
        <div
          style={{
            fontSize: "2.25rem",
            fontFamily: "var(--font-mono)",
            color: moving ? "var(--accent)" : "var(--text-muted)",
            lineHeight: 1,
          }}
        >
          {!connected ? "—" : Math.abs(speedCmS).toFixed(1)}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>cm/s</div>
        {connected && active && (
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
            {speedCmS < -0.5 ? "← înapoi" : speedCmS > 0.5 ? "→ înainte" : "oprit"}
          </div>
        )}
      </div>
    </div>
  );
}
