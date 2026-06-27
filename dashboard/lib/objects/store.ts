import { ObjectId } from "mongodb";
import type { DetectedObject } from "@/app/types/robot";
import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS, ObjectDoc } from "@/lib/mongodb/schemas";

export async function listObjects(limit = 50): Promise<ObjectDoc[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .collection<ObjectDoc>(COLLECTIONS.objects)
    .find({})
    .sort({ lastSeenAt: -1 })
    .limit(limit)
    .toArray();
}

export async function upsertKnownObjects(objects: DetectedObject[], roomId?: string): Promise<void> {
  if (!objects.length) return;

  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const col = db.collection<ObjectDoc>(COLLECTIONS.objects);

  for (const obj of objects) {
    const filter = roomId
      ? { label: obj.label, roomId }
      : { label: obj.label, roomId: null };
    await col.updateOne(
      filter,
      {
        $set: { lastSeenAt: now, updatedAt: now },
        $setOnInsert: {
          label: obj.label,
          roomId: roomId ?? null,
          createdAt: now,
        },
        $inc: { sightingCount: 1 },
      },
      { upsert: true }
    );
  }
}

export async function updateObject(
  id: string,
  patch: Partial<Pick<ObjectDoc, "name" | "description" | "roomId" | "label">>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.collection<ObjectDoc>(COLLECTIONS.objects).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } }
  );
  return result.matchedCount > 0;
}

export async function createObjectManual(
  label: string,
  name: string,
  roomId?: string,
  description?: string
): Promise<ObjectDoc | null> {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const doc: ObjectDoc = {
    label,
    name,
    roomId,
    description,
    sightingCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection<ObjectDoc>(COLLECTIONS.objects).insertOne(doc);
  return { ...doc, _id: String(result.insertedId) };
}
