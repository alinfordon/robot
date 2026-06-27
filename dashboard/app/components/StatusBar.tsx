"use client";

import { RobotStatus } from "@/app/types/robot";

interface StatusBarProps {
  wsConnected: boolean;
  robotStatus: RobotStatus;
  latency: number;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

export default function StatusBar({ wsConnected, robotStatus, latency }: StatusBarProps) {
  const { connected, metrics, cameraFps, uptime } = robotStatus;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        background: "var(--panel)",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", color: "var(--accent)" }}>
          ROBO_V1
        </h1>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Dashboard v1.0</span>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
        <StatusDot label="WS" ok={wsConnected} detail={latency ? `${latency}ms` : "—"} />
        <StatusDot label="Robot" ok={connected} detail={robotStatus.state} />
        <Metric label="CPU" value={`${metrics.cpu.toFixed(0)}%`} />
        <Metric label="RAM" value={`${metrics.ram.toFixed(0)}%`} />
        <Metric label="Temp" value={`${metrics.temp.toFixed(0)}°C`} />
        <Metric label="Bat" value={`${metrics.battery.toFixed(0)}%`} />
        <Metric label="Cam FPS" value={String(cameraFps)} />
        <Metric label="Uptime" value={formatUptime(uptime)} />
      </div>
    </header>
  );
}

function StatusDot({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: ok ? "var(--success)" : "var(--danger)",
          boxShadow: ok ? "0 0 6px var(--success)" : "0 0 6px var(--danger)",
        }}
      />
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span>{detail}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "var(--text-muted)" }}>{label}: </span>
      <span style={{ color: "var(--accent)" }}>{value}</span>
    </div>
  );
}
