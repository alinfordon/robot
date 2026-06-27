"use client";

import { useCallback, useEffect, useState } from "react";

type Section = "rooms" | "objects" | "observations" | "events" | "tasks" | "memories";

interface RoomItem {
  id: string;
  name: string;
  description?: string;
}

interface ObjectItem {
  id: string;
  label: string;
  name?: string;
  description?: string;
  roomId?: string;
  sightingCount: number;
  lastSeenAt?: string;
}

interface EventItem {
  id: string;
  ts: string;
  type: string;
  source: string;
  summary?: string;
  importance: string;
}

interface TaskItem {
  id: string;
  type: string;
  command: string;
  status: string;
  createdAt: string;
  completedAt?: string;
}

interface MemoryItem {
  id: string;
  ts: string;
  summary: string;
  content: string;
  tags?: string[];
}

interface ObservationItem {
  id: string;
  ts: string;
  roomId?: string;
  objectCount: number;
  objects: string[];
  state?: string;
  mode?: string;
}

const SECTIONS: { id: Section; label: string }[] = [
  { id: "rooms", label: "Camere" },
  { id: "objects", label: "Obiecte" },
  { id: "observations", label: "Observații" },
  { id: "events", label: "Evenimente" },
  { id: "tasks", label: "Task-uri" },
  { id: "memories", label: "Amintiri" },
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MemoryPanel() {
  const [section, setSection] = useState<Section>("rooms");
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [objects, setObjects] = useState<ObjectItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [observations, setObservations] = useState<ObservationItem[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [newObjectLabel, setNewObjectLabel] = useState("");
  const [newObjectName, setNewObjectName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRooms = useCallback(async () => {
    const [roomsRes, currentRes] = await Promise.all([
      fetch("/api/rooms"),
      fetch("/api/rooms/current"),
    ]);
    const roomsData = await roomsRes.json();
    const currentData = await currentRes.json();
    setRooms(roomsData.rooms || []);
    setCurrentRoomId(currentData.roomId || null);
  }, []);

  const loadSection = useCallback(async () => {
    setLoading(true);
    try {
      if (section === "rooms") await loadRooms();
      if (section === "objects") {
        const res = await fetch("/api/objects");
        const data = await res.json();
        setObjects(data.objects || []);
      }
      if (section === "observations") {
        const q = currentRoomId ? `?roomId=${currentRoomId}` : "";
        const res = await fetch(`/api/observations${q}`);
        const data = await res.json();
        setObservations(data.observations || []);
      }
      if (section === "events") {
        const res = await fetch("/api/events?limit=50");
        const data = await res.json();
        setEvents(data.events || []);
      }
      if (section === "tasks") {
        const res = await fetch("/api/tasks?limit=40");
        const data = await res.json();
        setTasks(data.tasks || []);
      }
      if (section === "memories") {
        const res = await fetch("/api/memories?limit=30");
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } finally {
      setLoading(false);
    }
  }, [section, loadRooms, currentRoomId]);

  useEffect(() => {
    void loadSection();
  }, [loadSection]);

  const setCurrentRoom = async (roomId: string | null) => {
    await fetch("/api/rooms/current", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
    setCurrentRoomId(roomId);
    setMessage(roomId ? "Camera curentă actualizată." : "Camera curentă resetată.");
  };

  const addRoom = async () => {
    if (!newRoomName.trim()) return;
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newRoomName.trim() }),
    });
    if (res.ok) {
      setNewRoomName("");
      await loadRooms();
      setMessage("Camera adăugată.");
    }
  };

  const addObject = async () => {
    if (!newObjectLabel.trim() || !newObjectName.trim()) return;
    const res = await fetch("/api/objects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: newObjectLabel.trim(),
        name: newObjectName.trim(),
        roomId: currentRoomId || undefined,
      }),
    });
    if (res.ok) {
      setNewObjectLabel("");
      setNewObjectName("");
      await loadSection();
      setMessage("Obiect adăugat.");
    }
  };

  const updateObjectMeta = async (id: string, name: string) => {
    await fetch("/api/objects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    setMessage("Obiect actualizat.");
    await loadSection();
  };

  const consolidate = async () => {
    setLoading(true);
    const res = await fetch("/api/memories?action=consolidate", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setMessage("Amintire consolidată din evenimente.");
      await loadSection();
    } else {
      setMessage(data.error || "Consolidare eșuată.");
    }
  };

  return (
    <div className="memory-panel">
      <div className="memory-panel-header">
        <div className="panel-title" style={{ margin: 0 }}>Memorie robot</div>
        <select
          value={currentRoomId || ""}
          onChange={(e) => void setCurrentRoom(e.target.value || null)}
          style={{ fontSize: "0.8rem", maxWidth: 180 }}
        >
          <option value="">— camera curentă —</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <p style={{ margin: "8px 0", fontSize: "0.78rem", color: "var(--accent)" }}>{message}</p>
      )}

      <nav className="memory-section-tabs">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`btn ${section === s.id ? "btn-active" : ""}`}
            style={{ fontSize: "0.72rem", padding: "4px 8px" }}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="memory-section-content scroll-y">
        {loading && <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Se încarcă...</p>}

        {section === "rooms" && (
          <>
            <ul className="memory-list">
              {rooms.map((r) => (
                <li key={r.id} className={currentRoomId === r.id ? "memory-list-active" : ""}>
                  <strong>{r.name}</strong>
                  {r.description && <span className="memory-muted"> — {r.description}</span>}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                placeholder="Nume cameră nouă"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                style={{ flex: 1, fontSize: "0.85rem" }}
              />
              <button className="btn btn-primary" onClick={() => void addRoom()}>
                Adaugă
              </button>
            </div>
          </>
        )}

        {section === "objects" && (
          <>
            <ul className="memory-list">
              {objects.map((o) => (
                <li key={o.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      <strong>{o.name || o.label}</strong>
                      <span className="memory-muted"> ({o.label}) · {o.sightingCount}×</span>
                    </span>
                    {o.lastSeenAt && <span className="memory-muted">{fmtTime(o.lastSeenAt)}</span>}
                  </div>
                  <input
                    defaultValue={o.name || ""}
                    placeholder="Nume prietenos"
                    style={{ width: "100%", marginTop: 4, fontSize: "0.78rem" }}
                    onBlur={(e) => {
                      if (e.target.value !== (o.name || "")) {
                        void updateObjectMeta(o.id, e.target.value);
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
            <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
              <input
                placeholder="Label YOLO (ex: tv)"
                value={newObjectLabel}
                onChange={(e) => setNewObjectLabel(e.target.value)}
                style={{ fontSize: "0.85rem" }}
              />
              <input
                placeholder="Nume (ex: Televizor living)"
                value={newObjectName}
                onChange={(e) => setNewObjectName(e.target.value)}
                style={{ fontSize: "0.85rem" }}
              />
              <button className="btn btn-primary" onClick={() => void addObject()}>
                Adaugă obiect manual
              </button>
            </div>
          </>
        )}

        {section === "observations" && (
          <ul className="memory-list">
            {observations.map((o) => (
              <li key={o.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{o.objects.join(", ") || "—"}</span>
                  <span className="memory-muted">{fmtTime(o.ts)}</span>
                </div>
                <div className="memory-muted" style={{ fontSize: "0.72rem" }}>
                  {o.state || "?"} · {o.mode || "?"} · {o.objectCount} obiecte
                </div>
              </li>
            ))}
          </ul>
        )}

        {section === "events" && (
          <ul className="memory-list">
            {events.map((e) => (
              <li key={e.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    <span className={`memory-badge memory-badge-${e.importance}`}>{e.importance}</span>{" "}
                    {e.summary || e.type}
                  </span>
                  <span className="memory-muted">{fmtTime(e.ts)}</span>
                </div>
                <div className="memory-muted" style={{ fontSize: "0.72rem" }}>
                  {e.type} · {e.source}
                </div>
              </li>
            ))}
          </ul>
        )}

        {section === "tasks" && (
          <ul className="memory-list">
            {tasks.map((t) => (
              <li key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    <span className={`memory-badge memory-badge-${t.status === "done" ? "high" : "medium"}`}>
                      {t.status}
                    </span>{" "}
                    {t.command}
                  </span>
                  <span className="memory-muted">{fmtTime(t.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {section === "memories" && (
          <>
            <button
              className="btn btn-primary"
              style={{ marginBottom: 10, fontSize: "0.78rem" }}
              disabled={loading}
              onClick={() => void consolidate()}
            >
              Consolidează evenimente (AI)
            </button>
            <ul className="memory-list">
              {memories.map((m) => (
                <li key={m.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{m.summary}</strong>
                    <span className="memory-muted">{fmtTime(m.ts)}</span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {m.content.slice(0, 200)}
                    {m.content.length > 200 ? "…" : ""}
                  </p>
                  {m.tags?.length ? (
                    <div className="memory-muted" style={{ fontSize: "0.7rem" }}>
                      {m.tags.join(", ")}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
