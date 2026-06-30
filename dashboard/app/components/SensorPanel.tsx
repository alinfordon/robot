"use client";

import { SensorData, SensorMeta, UltrasonicId } from "@/app/types/robot";

interface SensorPanelProps {
  sensors: SensorData;
  meta: SensorMeta;
  connected?: boolean;
}

const ENTRIES: { key: UltrasonicId; label: string; angle: number }[] = [
  { key: "front", label: "F", angle: 0 },
  { key: "left", label: "St", angle: -90 },
  { key: "right", label: "Dr", angle: 90 },
  { key: "back", label: "S", angle: 180 },
];

const RO_NAMES: Record<UltrasonicId, string> = {
  front: "Față",
  left: "Stânga",
  right: "Dreapta",
  back: "Spate",
};

function distanceColor(cm: number, active: boolean): string {
  if (!active) return "#444";
  if (cm <= 0 || cm >= 999) return "var(--warning)";
  if (cm < 20) return "var(--danger)";
  if (cm < 50) return "var(--warning)";
  return "var(--success)";
}

function formatDistance(cm: number, active: boolean): string {
  if (!active) return "neconectat";
  if (cm >= 999) return "fără ecou";
  return `${Math.round(cm)} cm`;
}

function SensorArc({
  label,
  value,
  angle,
  active,
}: {
  label: string;
  value: number;
  angle: number;
  active: boolean;
}) {
  const maxDist = 100;
  const normalized = active && value < 999 ? Math.min(value, maxDist) / maxDist : 0;
  const radius = 20 + normalized * 35;
  const color = distanceColor(value, active);
  const rad = (angle * Math.PI) / 180;
  const cx = 100 + Math.sin(rad) * 55;
  const cy = 100 - Math.cos(rad) * 55;

  return (
    <g opacity={active ? 1 : 0.35}>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={color}
        opacity={active ? 0.25 : 0.08}
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={active ? undefined : "3 2"}
      />
      <text x={cx} y={cy + 4} textAnchor="middle" fill="var(--text)" fontSize="9" fontFamily="var(--font-mono)">
        {active ? (value >= 999 ? "—" : `${Math.round(value)}`) : "○"}
      </text>
      <text x={cx} y={cy + radius + 12} textAnchor="middle" fill="var(--text-muted)" fontSize="7">
        {label}
      </text>
    </g>
  );
}

export default function SensorPanel({ sensors, meta, connected }: SensorPanelProps) {
  const activeSet = new Set(meta.active);
  const anyActive = meta.active.length > 0;
  const hwOk = meta.hardware && anyActive;

  return (
    <div className="panel">
      <div className="panel-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span>Senzori HC-SR04</span>
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

      {connected && anyActive && (
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 6, fontFamily: "var(--font-mono)" }}>
          Activ: {meta.active.map((id) => RO_NAMES[id]).join(", ")}
        </div>
      )}

      <svg width="100%" viewBox="0 0 200 200" style={{ maxHeight: 200 }}>
        <circle cx="100" cy="100" r="8" fill="var(--accent)" />
        <rect x="92" y="96" width="16" height="8" rx="2" fill="var(--panel)" stroke="var(--accent)" />
        {ENTRIES.map(({ key, label, angle }) => (
          <SensorArc
            key={key}
            label={label}
            value={sensors[key]}
            angle={angle}
            active={activeSet.has(key)}
          />
        ))}
      </svg>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 6,
          marginTop: 8,
          fontSize: "0.7rem",
          fontFamily: "var(--font-mono)",
        }}
      >
        {ENTRIES.map(({ key }) => {
          const active = activeSet.has(key);
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: distanceColor(sensors[key], active),
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: active ? (hwOk ? "var(--success)" : "var(--warning)") : "#444",
                  flexShrink: 0,
                }}
                title={active ? "activ" : "neconectat"}
              />
              <span>
                {RO_NAMES[key]}: {formatDistance(sensors[key], active)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
