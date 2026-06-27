import { getCurrentRoomId } from "@/lib/context/current-room";
import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS, EventDoc, EventImportance, EventSource } from "@/lib/mongodb/schemas";

const SAVE_ALL_EVENTS = process.env.MONGODB_SAVE_ALL_EVENTS === "1";

/** Telemetrie în timp real — acoperită de observations (throttled) sau UI live */
const SKIP_EVENT_TYPES = new Set([
  "HEARTBEAT",
  "CAMERA_FRAME",
  "SENSORS",
  "SYSTEM",
  "PING",
  "LOG",
  "STATE",
  "SET_STT_CONFIG",
  "DETECTED_OBJECTS",
]);

function eventImportance(type: string): EventImportance {
  if (
    [
      "SPEECH_RECOGNIZED",
      "AI_RESPONSE",
      "ROBOT_DISCONNECTED",
      "ROBOT_CONNECTED",
      "person_detected",
      "person_identified",
    ].includes(type)
  ) {
    return "high";
  }
  if (["DETECTED_OBJECTS", "STATE", "MOVE", "SPEAK", "SET_MODE"].includes(type)) {
    return "medium";
  }
  return "low";
}

export async function recordEvent(
  type: string,
  payload: Record<string, unknown>,
  source: EventSource,
  summary?: string,
  roomId?: string
): Promise<string | null> {
  if (SKIP_EVENT_TYPES.has(type)) return null;

  const importance = eventImportance(type);
  if (!SAVE_ALL_EVENTS && importance === "low") return null;

  const db = await getDb();
  if (!db) return null;

  const doc: EventDoc = {
    ts: new Date(),
    type,
    source,
    summary,
    payload,
    importance,
    roomId: roomId ?? getCurrentRoomId() ?? undefined,
  };

  const result = await db.collection<EventDoc>(COLLECTIONS.events).insertOne(doc);
  return String(result.insertedId);
}

export async function listEvents(opts?: {
  limit?: number;
  importance?: EventImportance | EventImportance[];
  roomId?: string;
  sinceHours?: number;
}): Promise<EventDoc[]> {
  const db = await getDb();
  if (!db) return [];

  const limit = opts?.limit ?? 40;
  const filter: Record<string, unknown> = {};

  if (opts?.importance) {
    filter.importance = Array.isArray(opts.importance) ? { $in: opts.importance } : opts.importance;
  }
  if (opts?.roomId) filter.roomId = opts.roomId;
  if (opts?.sinceHours) {
    filter.ts = { $gte: new Date(Date.now() - opts.sinceHours * 3600000) };
  }

  return db.collection<EventDoc>(COLLECTIONS.events).find(filter).sort({ ts: -1 }).limit(limit).toArray();
}

export async function getUnconsolidatedEvents(limit = 25): Promise<EventDoc[]> {
  const db = await getDb();
  if (!db) return [];

  const consolidated = await db.collection(COLLECTIONS.memories).distinct("sourceEventIds");
  const consolidatedSet = new Set(consolidated.flat().filter(Boolean));

  const events = await db
    .collection<EventDoc>(COLLECTIONS.events)
    .find({ importance: { $in: ["medium", "high"] } })
    .sort({ ts: -1 })
    .limit(limit * 2)
    .toArray();

  return events.filter((e) => e._id && !consolidatedSet.has(String(e._id))).slice(0, limit);
}
