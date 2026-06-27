"use client";

import { useState, useMemo } from "react";
import { DetectedObject } from "@/app/types/robot";

interface CameraFeedProps {
  frame: string | null;
  objects: DetectedObject[];
  width: number;
  height: number;
  fps: number;
}

export default function CameraFeed({ frame, objects, width, height, fps }: CameraFeedProps) {
  const [showDetections, setShowDetections] = useState(true);

  const imgSrc = useMemo(() => {
    if (!frame) return null;
    if (frame.startsWith("data:")) return frame;
    return `data:image/jpeg;base64,${frame}`;
  }, [frame]);

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="panel-title" style={{ margin: 0 }}>Cameră + YOLOv8</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
          <span style={{ color: "var(--accent)" }}>{fps} FPS</span>
          <button
            className={`btn ${showDetections ? "btn-active" : ""}`}
            style={{ padding: "2px 8px", fontSize: "0.7rem" }}
            onClick={() => setShowDetections(!showDetections)}
          >
            {showDetections ? "Detecții ON" : "Detecții OFF"}
          </button>
        </div>
      </div>
      <div className="camera-viewport">
        {imgSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc} alt="Camera feed" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            {showDetections && (
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {objects.map((obj, i) => {
                  const [x, y, w, h] = obj.bbox;
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--accent)" strokeWidth="2" />
                      <rect x={x} y={y - 18} width={Math.max(w, 80)} height="18" fill="var(--accent)" opacity={0.85} />
                      <text x={x + 4} y={y - 5} fill="#0a0c0f" fontSize="12" fontFamily="var(--font-mono)">
                        {obj.label} {(obj.confidence * 100).toFixed(0)}%
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Aștept stream de la robot...
          </div>
        )}
      </div>
    </div>
  );
}
