"use client";

import { SensorData } from "@/app/types/robot";

interface SensorPanelProps {
  sensors: SensorData;
}

function distanceColor(cm: number): string {
  if (cm <= 0 || cm >= 999) return "#555";
  if (cm < 20) return "var(--danger)";
  if (cm < 50) return "var(--warning)";
  return "var(--success)";
}

function SensorArc({
  label,
  value,
  angle,
}: {
  label: string;
  value: number;
  angle: number;
}) {
  const maxDist = 100;
  const normalized = Math.min(value, maxDist) / maxDist;
  const radius = 20 + normalized * 35;
  const color = distanceColor(value);
  const rad = (angle * Math.PI) / 180;
  const cx = 100 + Math.sin(rad) * 55;
  const cy = 100 - Math.cos(rad) * 55;

  return (
    <g>
      <circle cx={cx} cy={cy} r={radius} fill={color} opacity={0.25} stroke={color} strokeWidth="1.5" />
      <text x={cx} y={cy + 4} textAnchor="middle" fill="var(--text)" fontSize="9" fontFamily="var(--font-mono)">
        {value >= 999 ? "—" : `${Math.round(value)}`}
      </text>
      <text x={cx} y={cy + radius + 12} textAnchor="middle" fill="var(--text-muted)" fontSize="7">
        {label}
      </text>
    </g>
  );
}

export default function SensorPanel({ sensors }: SensorPanelProps) {
  const entries: { key: keyof SensorData; label: string; angle: number }[] = [
    { key: "front_left", label: "F-St", angle: -45 },
    { key: "front_center", label: "F-C", angle: 0 },
    { key: "front_right", label: "F-Dr", angle: 45 },
    { key: "left", label: "St", angle: -90 },
    { key: "right", label: "Dr", angle: 90 },
    { key: "back_left", label: "S-St", angle: -135 },
    { key: "back_right", label: "S-Dr", angle: 135 },
  ];

  return (
    <div className="panel">
      <div className="panel-title">Senzori HC-SR04 × 7</div>
      <svg width="100%" viewBox="0 0 200 200" style={{ maxHeight: 200 }}>
        <circle cx="100" cy="100" r="8" fill="var(--accent)" />
        <rect x="92" y="96" width="16" height="8" rx="2" fill="var(--panel)" stroke="var(--accent)" />
        {entries.map(({ key, label, angle }) => (
          <SensorArc key={key} label={label} value={sensors[key]} angle={angle} />
        ))}
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: 8, fontSize: "0.7rem", fontFamily: "var(--font-mono)" }}>
        {entries.map(({ key, label }) => (
          <div key={key} style={{ color: distanceColor(sensors[key]) }}>
            {label}: {sensors[key] >= 999 ? "—" : `${Math.round(sensors[key])}cm`}
          </div>
        ))}
      </div>
    </div>
  );
}
