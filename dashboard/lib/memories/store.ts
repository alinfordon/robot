import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS, MemoryDoc } from "@/lib/mongodb/schemas";
import { getUnconsolidatedEvents } from "@/lib/events/store";

export async function saveMemory(
  summary: string,
  content: string,
  opts?: { sourceEventIds?: string[]; tags?: string[]; roomId?: string; peopleIds?: string[] }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const doc: MemoryDoc = {
    ts: new Date(),
    summary,
    content,
    sourceEventIds: opts?.sourceEventIds,
    tags: opts?.tags,
    roomId: opts?.roomId,
    peopleIds: opts?.peopleIds,
  };

  await db.collection<MemoryDoc>(COLLECTIONS.memories).insertOne(doc);
}

export async function listMemories(limit = 30, tag?: string): Promise<MemoryDoc[]> {
  const db = await getDb();
  if (!db) return [];

  const filter = tag ? { tags: tag } : {};
  return db.collection<MemoryDoc>(COLLECTIONS.memories).find(filter).sort({ ts: -1 }).limit(limit).toArray();
}

export async function getRecentMemories(limit = 8): Promise<MemoryDoc[]> {
  return listMemories(limit);
}

export async function saveChatMemory(userMessage: string, assistantReply: string): Promise<void> {
  const summary = userMessage.length > 120 ? `${userMessage.slice(0, 117)}...` : userMessage;
  await saveMemory(summary, `Utilizator: ${userMessage}\nRobot: ${assistantReply}`, { tags: ["chat"] });
}

export async function consolidateRecentEvents(): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const events = await getUnconsolidatedEvents(15);
  if (events.length < 3) {
    return { ok: false, error: "Prea puține evenimente noi (minim 3)." };
  }

  const lines = events
    .map((e) => `- [${e.ts.toISOString()}] ${e.summary || e.type} (${e.source})`)
    .join("\n");

  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL_FAST || "llama3.2:3b";

  const prompt = `Rezumă evenimentele robotului într-un paragraf scurt în română, util pentru memoria pe termen lung. Păstrează nume de persoane și obiecte importante.

Evenimente:
${lines}`;

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) return { ok: false, error: `Ollama error ${res.status}` };

    const data = await res.json();
    const summary = String(data.response || "").trim();
    if (!summary) return { ok: false, error: "Răspuns gol de la Ollama." };

    const eventIds = events.map((e) => String(e._id)).filter(Boolean);
    await saveMemory(summary.slice(0, 200), summary, {
      sourceEventIds: eventIds,
      tags: ["consolidated", "events"],
    });

    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function buildMemoryContext(): Promise<string> {
  const { listRooms } = await import("@/lib/rooms/store");
  const { listObjects } = await import("@/lib/objects/store");
  const { listEvents } = await import("@/lib/events/store");
  const { getPeople } = await import("@/lib/memory/store");

  const [memories, objects, events, people, rooms] = await Promise.all([
    getRecentMemories(5),
    listObjects(12),
    listEvents({ limit: 5, importance: ["medium", "high"] }),
    getPeople(),
    listRooms(),
  ]);

  const parts: string[] = [];

  if (rooms.length) {
    parts.push(`Camere cunoscute: ${rooms.map((r) => r.name).join(", ")}.`);
  }
  if (people.length) {
    parts.push(`Persoane: ${people.map((p) => p.name).join(", ")}.`);
  }
  if (objects.length) {
    parts.push(`Obiecte din casă: ${objects.map((o) => o.name || o.label).join(", ")}.`);
  }
  if (events.length) {
    parts.push(`Evenimente recente: ${events.map((e) => e.summary || e.type).join("; ")}.`);
  }
  if (memories.length) {
    parts.push(`Amintiri: ${memories.map((m) => m.summary).join("; ")}.`);
  }

  return parts.join("\n");
}
