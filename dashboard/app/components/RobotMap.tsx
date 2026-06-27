"use client";

import { SensorData } from "@/app/types/robot";

interface RobotMapProps {
  sensors: SensorData;
}

export default function RobotMap({ sensors }: RobotMapProps) {
  const obstacles: { x: number; y: number; label: string }[] = [];
  const scale = 1.2;

  if (sensors.front_center < 80) obstacles.push({ x: 0, y: -sensors.front_center * scale, label: "F" });
  if (sensors.front_left < 80) obstacles.push({ x: -30, y: -sensors.front_left * scale * 0.7, label: "FL" });
  if (sensors.front_right < 80) obstacles.push({ x: 30, y: -sensors.front_right * scale * 0.7, label: "FR" });
  if (sensors.left < 80) obstacles.push({ x: -sensors.left * scale, y: 0, label: "L" });
  if (sensors.right < 80) obstacles.push({ x: sensors.right * scale, y: 0, label: "R" });
  if (sensors.back_left < 80) obstacles.push({ x: -25, y: sensors.back_left * scale * 0.7, label: "BL" });
  if (sensors.back_right < 80) obstacles.push({ x: 25, y: sensors.back_right * scale * 0.7, label: "BR" });

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
            <text x={o.x} y={-o.y + 3} textAnchor="middle" fill="#fff" fontSize="6">{o.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
