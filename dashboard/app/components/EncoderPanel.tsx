"use client";

import { EncoderData, EncoderMeta, WheelSide } from "@/app/types/robot";

interface EncoderPanelProps {
  encoders: EncoderData;
  meta: EncoderMeta;
  connected?: boolean;
}

const RO: Record<WheelSide, string> = { left: "Stânga", right: "Dreapta" };

function rpmBar(rpm: number, active: boolean) {
  const pct = Math.min(100, (Math.abs(rpm) / 120) * 100);
  const color = !active ? "#444" : rpm < 0 ? "var(--warning)" : "var(--accent)";
  return (
    <div style={{ background: "var(--bar-bg, #1e2530)", borderRadius: 3, height: 8, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
  );
}

export default function EncoderPanel({ encoders, meta, connected }: EncoderPanelProps) {
  const activeSet = new Set(meta.active);
  const anyActive = meta.active.length > 0;
  const hwOk = meta.hardware && anyActive;

  const sides: WheelSide[] = ["left", "right"];

  return (
    <div className="panel" style={{ marginTop: 8 }}>
      <div
        className="panel-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <span>Encodere OKY3278</span>
        <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", fontWeight: 400 }}>
          {!connected ? (
            <span style={{ color: "var(--text-muted)" }}>offline</span>
          ) : !anyActive ? (
            <span style={{ color: "var(--warning)" }}>dezactivat</span>
          ) : hwOk ? (
            <span style={{ color: "var(--success)" }}>GPIO OK</span>
          ) : (
            <span style={{ color: "var(--danger)" }}>fără GPIO</span>
          )}
        </span>
      </div>

      <div
        style={{
          textAlign: "center",
          padding: "8px 0 12px",
          borderBottom: "1px solid var(--border)",
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4 }}>
          Viteză deplasare (medie)
        </div>
        <div style={{ fontSize: "1.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
          {Math.abs(encoders.speed_cm_s).toFixed(1)}
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}> cm/s</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {sides.map((side) => {
          const w = encoders[side];
          const active = activeSet.has(side);
          return (
            <div
              key={side}
              style={{
                opacity: active ? 1 : 0.45,
                padding: 8,
                background: "var(--bg)",
                borderRadius: 6,
                border: `1px solid ${active ? "var(--border)" : "#333"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: active ? (hwOk ? "var(--success)" : "var(--warning)") : "#444",
                  }}
                />
                <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{RO[side]}</span>
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 2 }}>RPM</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", marginBottom: 4 }}>
                {active ? w.rpm.toFixed(1) : "—"}
              </div>
              {rpmBar(w.rpm, active)}
              <div
                style={{
                  marginTop: 8,
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                }}
              >
                <div>{active ? `${w.cm_s.toFixed(1)} cm/s` : "neconectat"}</div>
                <div>{active ? `${w.pps.toFixed(1)} imp/s` : ""}</div>
                <div>{active ? `${w.pulses} impulsuri` : ""}</div>
              </div>
            </div>
          );
        })}
      </div>

      {connected && anyActive && (
        <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
          PPR disc: {meta.ppr} · GPIO20=stânga · GPIO16=dreapta
        </div>
      )}
    </div>
  );
}
