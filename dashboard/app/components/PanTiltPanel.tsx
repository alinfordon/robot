"use client";

import { useCallback, useEffect, useState } from "react";
import { PanTiltDirection, PanTiltState } from "@/app/types/robot";

interface PanTiltPanelProps {
  pantilt: PanTiltState;
  connected: boolean;
  onLook: (direction: PanTiltDirection, step?: number) => void;
  onSet: (pan: number, tilt: number) => void;
}

const KEY_MAP: Record<string, PanTiltDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  c: "center",
};

function DirButton({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="btn"
      style={{ width: 48, height: 48, fontSize: "1.1rem", fontWeight: 700 }}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {label}
    </button>
  );
}

function AxisSlider({
  label,
  value,
  min,
  max,
  disabled,
  onInput,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onInput: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", minWidth: 40 }}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onInput(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        style={{ flex: 1, accentColor: "var(--accent)" }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.875rem",
          minWidth: 46,
          textAlign: "right",
        }}
      >
        {Math.round(value)}°
      </span>
    </div>
  );
}

export default function PanTiltPanel({ pantilt, connected, onLook, onSet }: PanTiltPanelProps) {
  const { limits } = pantilt;
  const [pan, setPan] = useState(pantilt.pan);
  const [tilt, setTilt] = useState(pantilt.tilt);
  const [dragging, setDragging] = useState(false);
  const disabled = !connected || !pantilt.enabled;

  // Robotul e sursa de adevar cat timp nu tragem de slidere
  useEffect(() => {
    if (dragging) return;
    setPan(pantilt.pan);
    setTilt(pantilt.tilt);
  }, [pantilt.pan, pantilt.tilt, dragging]);

  const look = useCallback(
    (direction: PanTiltDirection) => {
      if (disabled) return;
      onLook(direction);
    },
    [disabled, onLook]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const direction = KEY_MAP[e.key] ?? KEY_MAP[e.key.toLowerCase()];
      if (!direction) return;
      e.preventDefault();
      look(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [look]);

  const commit = useCallback(() => {
    setDragging(false);
    if (disabled) return;
    if (pan === pantilt.pan && tilt === pantilt.tilt) return;
    onSet(pan, tilt);
  }, [disabled, pan, tilt, pantilt.pan, pantilt.tilt, onSet]);

  return (
    <div className="panel" style={{ marginTop: 8 }}>
      <div
        className="panel-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <span>Cameră pan &amp; tilt · săgeți</span>
        <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", fontWeight: 400 }}>
          {!connected ? (
            <span style={{ color: "var(--text-muted)" }}>robot offline</span>
          ) : !pantilt.enabled ? (
            <span style={{ color: "var(--text-muted)" }}>dezactivat</span>
          ) : !pantilt.hardware ? (
            <span style={{ color: "var(--warning)" }}>simulare</span>
          ) : (
            <span style={{ color: "var(--accent)" }}>PCA9685</span>
          )}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 48px)",
          gap: 8,
          justifyContent: "center",
        }}
      >
        <div />
        <DirButton label="↑" title={`Sus · ${pantilt.step}°`} disabled={disabled} onClick={() => look("up")} />
        <div />
        <DirButton label="←" title={`Stânga · ${pantilt.step}°`} disabled={disabled} onClick={() => look("left")} />
        <DirButton label="⌖" title="Centrare (tasta C)" disabled={disabled} onClick={() => look("center")} />
        <DirButton label="→" title={`Dreapta · ${pantilt.step}°`} disabled={disabled} onClick={() => look("right")} />
        <div />
        <DirButton label="↓" title={`Jos · ${pantilt.step}°`} disabled={disabled} onClick={() => look("down")} />
        <div />
      </div>

      <div style={{ marginTop: 16 }}>
        <AxisSlider
          label="Pan"
          value={pan}
          min={limits.pan_min}
          max={limits.pan_max}
          disabled={disabled}
          onInput={(v) => {
            setDragging(true);
            setPan(v);
          }}
          onCommit={commit}
        />
        <AxisSlider
          label="Tilt"
          value={tilt}
          min={limits.tilt_min}
          max={limits.tilt_max}
          disabled={disabled}
          onInput={(v) => {
            setDragging(true);
            setTilt(v);
          }}
          onCommit={commit}
        />
      </div>

      <div
        style={{
          marginTop: 4,
          textAlign: "center",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        robot: pan {Math.round(pantilt.pan)}° · tilt {Math.round(pantilt.tilt)}° · pas {pantilt.step}°
      </div>
    </div>
  );
}
