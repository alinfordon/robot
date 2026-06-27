"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Direction, RobotMode } from "@/app/types/robot";

interface MotorControlProps {
  mode: RobotMode;
  onMove: (direction: Direction, speed: number) => void;
  onSetMode: (mode: RobotMode) => void;
}

const MODES: RobotMode[] = ["manual", "auto", "patrol", "vision"];

export default function MotorControl({ mode, onMove, onSetMode }: MotorControlProps) {
  const [speed, setSpeed] = useState(65);
  const [activeDir, setActiveDir] = useState<Direction | null>(null);
  const keysRef = useRef<Set<string>>(new Set());

  const handleMove = useCallback(
    (direction: Direction) => {
      if (direction === "stop") {
        onMove("stop", 0);
        setActiveDir(null);
      } else {
        onMove(direction, speed);
        setActiveDir(direction);
      }
    },
    [onMove, speed]
  );

  useEffect(() => {
    const keyMap: Record<string, Direction> = {
      w: "forward",
      s: "backward",
      a: "left",
      d: "right",
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (keyMap[key] && !keysRef.current.has(key)) {
        keysRef.current.add(key);
        handleMove(keyMap[key]);
      }
      if (key === " ") {
        e.preventDefault();
        handleMove("stop");
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.delete(key);
      if (keyMap[key]) handleMove("stop");
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleMove]);

  const JoystickBtn = ({ dir, label }: { dir: Direction; label: string }) => (
    <button
      className={`btn ${activeDir === dir ? "btn-active" : ""}`}
      style={{ width: 56, height: 56, fontSize: "1.2rem", fontWeight: 700 }}
      onMouseDown={() => handleMove(dir)}
      onMouseUp={() => handleMove("stop")}
      onMouseLeave={() => activeDir === dir && handleMove("stop")}
      onTouchStart={(e) => { e.preventDefault(); handleMove(dir); }}
      onTouchEnd={() => handleMove("stop")}
    >
      {label}
    </button>
  );

  return (
    <div className="panel">
      <div className="panel-title">Control motoare · WASD</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {MODES.map((m) => (
          <button
            key={m}
            className={`btn ${mode === m ? "btn-active" : ""}`}
            onClick={() => onSetMode(m)}
            style={{ textTransform: "uppercase", fontSize: "0.75rem" }}
          >
            {m}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", minWidth: 60 }}>Viteză</label>
        <input
          type="range"
          min={0}
          max={100}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", minWidth: 40 }}>{speed}%</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 56px)", gap: 8, justifyContent: "center" }}>
        <div />
        <JoystickBtn dir="forward" label="↑" />
        <div />
        <JoystickBtn dir="left" label="←" />
        <button className="btn" style={{ width: 56, height: 56, color: "var(--danger)" }} onClick={() => handleMove("stop")}>
          ■
        </button>
        <JoystickBtn dir="right" label="→" />
        <div />
        <JoystickBtn dir="backward" label="↓" />
        <div />
      </div>

      {activeDir && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: "0.75rem", color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
          Direcție: {activeDir.toUpperCase()} @ {speed}%
        </div>
      )}
    </div>
  );
}
