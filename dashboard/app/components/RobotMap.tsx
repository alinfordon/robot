"use client";

import { SensorData, SensorMeta, UltrasonicId } from "@/app/types/robot";

interface RobotMapProps {
  sensors: SensorData;
  meta: SensorMeta;
}

const DIRECTIONS: { key: UltrasonicId; x: number; y: number; label: string }[] = [
  { key: "front", x: 0, y: -1, label: "F" },
  { key: "left", x: -1, y: 0, label: "L" },
  { key: "right", x: 1, y: 0, label: "R" },
  { key: "back", x: 0, y: 1, label: "B" },
];

export default function RobotMap({ sensors, meta }: RobotMapProps) {
  const activeSet = new Set(meta.active);
  const scale = 1.2;
  const obstacles: { x: number; y: number; label: string }[] = [];

  for (const { key, x, y, label } of DIRECTIONS) {
    if (!activeSet.has(key)) continue;
    const d = sensors[key];
    if (d > 0 && d < 80) {
      obstacles.push({ x: x * d * scale * 0.55, y: y * d * scale * 0.55, label });
    }
  }

  return (
    <div className="panel" style={{ marginTop: 8 }}>
      <div className="panel-title">Hartă 2D</div>
      <svg width="100%" viewBox="-100 -100 200 200" style={{ maxHeight: 160, background: "#0a0c0f", borderRadius: 6 }}>
        {[20, 40, 60, 80].map((r) => (
          <circle key={r} cx="0" cy="0" r={r} fill="none" stroke="#1e2530" strokeWidth="0.5" />
        ))}
        <polygon points="0,-12 -8,8 8,8" fill="var(--accent)" opacity={0.9} />
        {obstacles.map((o, i) => (
          <g key={i}>
            <circle cx={o.x} cy={-o.y} r="6" fill="var(--danger)" opacity={0.7} />
            <text x={o.x} y={-o.y + 3} textAnchor="middle" fill="#fff" fontSize="6">
              {o.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
