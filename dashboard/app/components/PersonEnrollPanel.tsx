"use client";

import { useCallback, useEffect, useState } from "react";
import type { DetectedObject } from "@/app/types/robot";

interface PersonSummary {
  id: string;
  name: string;
  notes?: string;
  lastSeenAt?: string;
  hasFace: boolean;
  encodingCount: number;
}

interface PersonEnrollPanelProps {
  frame: string | null;
  objects: DetectedObject[];
}

function stripBase64(frame: string): string {
  return frame.replace(/^data:image\/\w+;base64,/, "");
}

export default function PersonEnrollPanel({ frame, objects }: PersonEnrollPanelProps) {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const personBbox = objects.find((o) => o.label === "person")?.bbox;
  const hasPerson = Boolean(personBbox);

  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch("/api/people");
      const data = await res.json();
      setPeople(data.people || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const handleEnroll = async () => {
    if (!frame) {
      setMessage({ type: "err", text: "Nu există cadru de la cameră." });
      return;
    }
    if (!name.trim()) {
      setMessage({ type: "err", text: "Introdu numele persoanei." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/people/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          notes: notes.trim() || undefined,
          imageBase64: stripBase64(frame),
          bbox: personBbox,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "Înregistrare eșuată." });
        return;
      }

      setMessage({ type: "ok", text: `${data.person.name} a fost înregistrat(ă).` });
      setName("");
      setNotes("");
      setOpen(false);
      await loadPeople();
    } catch {
      setMessage({ type: "err", text: "Eroare de rețea." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel" style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="panel-title" style={{ margin: 0 }}>Persoane</div>
        <button
          className="btn btn-primary"
          style={{ fontSize: "0.75rem", padding: "4px 10px" }}
          disabled={!frame || loading}
          onClick={() => {
            setOpen((v) => !v);
            setMessage(null);
          }}
        >
          {open ? "Închide" : "Înregistrează din cameră"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {hasPerson
              ? "Persoană detectată — se folosește zona YOLO pentru față."
              : "Nicio persoană detectată — se analizează tot cadrul."}
          </p>
          <input
            placeholder="Nume (ex: Alin)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            style={{ width: "100%", fontSize: "0.85rem" }}
          />
          <input
            placeholder="Notițe (opțional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={loading}
            style={{ width: "100%", fontSize: "0.85rem" }}
          />
          <button
            className="btn btn-primary"
            disabled={loading || !frame}
            onClick={() => void handleEnroll()}
          >
            {loading ? "Se procesează..." : "Salvează fața"}
          </button>
        </div>
      )}

      {message && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "0.78rem",
            color: message.type === "ok" ? "var(--accent)" : "#f87171",
          }}
        >
          {message.text}
        </p>
      )}

      {people.length > 0 && (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", fontSize: "0.78rem" }}>
          {people.map((p) => (
            <li
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "4px 0",
                borderTop: "1px solid var(--border)",
              }}
            >
              <span>
                {p.name}
                {p.hasFace ? ` · ${p.encodingCount} față${p.encodingCount === 1 ? "" : "e"}` : " · fără față"}
              </span>
              {p.lastSeenAt && (
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {new Date(p.lastSeenAt).toLocaleString("ro-RO", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
