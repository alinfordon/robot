"use client";

import { Mood } from "@/app/types/robot";

interface RobotFaceProps {
  mood: Mood;
  onClick?: () => void;
}

export default function RobotFace({ mood, onClick }: RobotFaceProps) {
  const isAlert = mood === "alert";
  const eyeColor = isAlert ? "#ff4757" : "var(--accent)";
  const blinkAnim = mood === "standby" || mood === "listening" ? "blink 4s infinite" : "none";
  const antennaAnim = isAlert ? "antenna-pulse 0.8s infinite" : "none";
  const mouthPath =
    mood === "happy"
      ? "M 55 95 Q 80 110 105 95"
      : mood === "talking"
        ? "M 60 98 Q 80 105 100 98 Q 80 112 60 98"
        : mood === "thinking"
          ? "M 65 100 L 95 100"
          : mood === "alert"
            ? "M 60 95 L 80 105 L 100 95"
            : "M 65 98 Q 80 105 95 98";

  return (
    <div className="panel" style={{ textAlign: "center", cursor: onClick ? "pointer" : "default" }}>
      <div className="panel-title">ROBO_V1 · {mood}</div>
      <svg
        width="160"
        height="120"
        viewBox="0 0 160 120"
        onClick={onClick}
        aria-label={`Robot mood: ${mood}`}
      >
        <rect x="20" y="20" width="120" height="90" rx="12" fill="#1a1f28" stroke={eyeColor} strokeWidth="2" />
        <line
          x1="80"
          y1="20"
          x2="80"
          y2="5"
          stroke={eyeColor}
          strokeWidth="3"
          style={{ animation: antennaAnim }}
        />
        <circle cx="80" cy="4" r="4" fill={isAlert ? "#ff4757" : "var(--accent)"} style={{ animation: isAlert ? "pulse-accent 0.8s infinite" : "none" }} />

        <ellipse cx="55" cy="55" rx="14" ry="16" fill="#0a0c0f" stroke={eyeColor} strokeWidth="1.5" />
        <ellipse cx="105" cy="55" rx="14" ry="16" fill="#0a0c0f" stroke={eyeColor} strokeWidth="1.5" />

        <circle
          cx={mood === "listening" ? 58 : 55}
          cy="55"
          r="6"
          fill={eyeColor}
          style={{ animation: blinkAnim, transformOrigin: "55px 55px" }}
        />
        <circle
          cx={mood === "listening" ? 102 : 105}
          cy="55"
          r="6"
          fill={eyeColor}
          style={{ animation: blinkAnim, transformOrigin: "105px 55px" }}
        />

        {mood === "thinking" && (
          <>
            <circle cx="125" cy="30" r="3" fill="var(--text-muted)" style={{ animation: "pulse-accent 1s infinite" }} />
            <circle cx="133" cy="22" r="2" fill="var(--text-muted)" style={{ animation: "pulse-accent 1s 0.3s infinite" }} />
            <circle cx="140" cy="15" r="1.5" fill="var(--text-muted)" style={{ animation: "pulse-accent 1s 0.6s infinite" }} />
          </>
        )}

        <path d={mouthPath} fill="none" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
