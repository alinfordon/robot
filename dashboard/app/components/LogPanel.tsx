"use client";

import { LogEntry } from "@/app/types/robot";

interface LogPanelProps {
  logs: LogEntry[];
}

const levelColors: Record<string, string> = {
  info: "var(--accent)",
  warn: "var(--warning)",
  error: "var(--danger)",
};

export default function LogPanel({ logs }: LogPanelProps) {
  return (
    <div className="panel log-panel-full">
      <div className="panel-title">Log sistem</div>
      <div className="scroll-y" style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>
        {logs.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>Niciun log încă...</p>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            style={{
              padding: "4px 0",
              borderBottom: "1px solid var(--border)",
              color: levelColors[log.level] || "var(--text)",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>
              {log.timestamp.toLocaleTimeString("ro-RO")}
            </span>{" "}
            <span style={{ opacity: 0.7 }}>[{log.module}]</span>{" "}
            {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}
