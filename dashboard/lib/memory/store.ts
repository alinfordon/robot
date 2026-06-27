import type { DetectedObject } from "@/app/types/robot";
import type { VisionEvent } from "@/lib/vision/processor";
import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS } from "@/lib/mongodb/schemas";
import { upsertKnownObjects } from "@/lib/objects/store";
import { recordEvent } from "@/lib/events/store";

export { buildMemoryContext, saveChatMemory, saveMemory } from "@/lib/memories/store";
export { recordObservation } from "@/lib/observations/store";
export { recordEvent } from "@/lib/events/store";
export { createTask, createTask as recordTask, markTaskDone, markTaskSent } from "@/lib/tasks/store";

export async function getPeople(): Promise<{ name: string; notes?: string; lastSeenAt?: Date }[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .collection(COLLECTIONS.people)
    .find({ name: { $ne: "necunoscut" } }, { projection: { name: 1, notes: 1, lastSeenAt: 1 } })
    .sort({ lastSeenAt: -1 })
    .limit(10)
    .toArray();
}

const personCooldownMs = parseInt(process.env.VISION_PERSON_COOLDOWN_MS || "60000", 10);
let lastPersonEventAt = 0;

export async function handleVisionEvents(events: VisionEvent[], objects: DetectedObject[]): Promise<void> {
  if (objects.length) {
    await upsertKnownObjects(objects);
  }

  for (const ev of events) {
    if (ev.event === "person_detected") continue;
    await recordEvent(
      ev.event,
      {
        label: ev.label,
        confidence: ev.confidence,
        timestamp: ev.timestamp,
        hasImage: Boolean(ev.image),
      },
      "ai",
      `${ev.label} detectat`
    );
  }
}

export function shouldReactToPerson(): boolean {
  const now = Date.now();
  if (now - lastPersonEventAt < personCooldownMs) return false;
  lastPersonEventAt = now;
  return true;
}
