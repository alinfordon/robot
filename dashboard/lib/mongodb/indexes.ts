import type { Db } from "mongodb";
import { COLLECTIONS } from "./schemas";

const OBSERVATION_TTL_DAYS = parseInt(process.env.MONGODB_OBSERVATION_TTL_DAYS || "7", 10);
const EVENT_TTL_DAYS = parseInt(process.env.MONGODB_EVENT_TTL_DAYS || "90", 10);

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.people).createIndexes([
      { key: { name: 1 }, unique: true },
      { key: { lastSeenAt: -1 } },
    ]),
    db.collection(COLLECTIONS.rooms).createIndexes([
      { key: { name: 1 }, unique: true },
    ]),
    db.collection(COLLECTIONS.objects).createIndexes([
      { key: { label: 1, roomId: 1 }, unique: true, sparse: true },
      { key: { lastSeenAt: -1 } },
    ]),
    db.collection(COLLECTIONS.observations).createIndexes([
      { key: { ts: -1 } },
      { key: { roomId: 1, ts: -1 } },
      { key: { ts: 1 }, expireAfterSeconds: OBSERVATION_TTL_DAYS * 86400 },
    ]),
    db.collection(COLLECTIONS.events).createIndexes([
      { key: { ts: -1 } },
      { key: { type: 1, ts: -1 } },
      { key: { importance: 1, ts: -1 } },
      { key: { ts: 1 }, expireAfterSeconds: EVENT_TTL_DAYS * 86400 },
    ]),
    db.collection(COLLECTIONS.tasks).createIndexes([
      { key: { status: 1, createdAt: -1 } },
    ]),
    db.collection(COLLECTIONS.memories).createIndexes([
      { key: { ts: -1 } },
      { key: { tags: 1 } },
      { key: { roomId: 1, ts: -1 } },
    ]),
  ]);

  console.log("[MongoDB] Indexes ready");
}
