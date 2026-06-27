import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS, RoomDoc } from "@/lib/mongodb/schemas";

const DEFAULT_ROOMS = [
  { name: "Living", description: "Canapea, TV, zonă relaxare" },
  { name: "Bucătărie", description: "Frigider, masă, electrocasnice" },
  { name: "Hol", description: "Intrare, coridor" },
  { name: "Dormitor", description: "Pat, dulap" },
];

export async function ensureDefaultRooms(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const count = await db.collection(COLLECTIONS.rooms).countDocuments();
  if (count > 0) return;

  const now = new Date();
  await db.collection<RoomDoc>(COLLECTIONS.rooms).insertMany(
    DEFAULT_ROOMS.map((r) => ({ ...r, createdAt: now, updatedAt: now }))
  );
}

export async function listRooms(): Promise<RoomDoc[]> {
  const db = await getDb();
  if (!db) return [];

  await ensureDefaultRooms();
  return db.collection<RoomDoc>(COLLECTIONS.rooms).find({}).sort({ name: 1 }).toArray();
}

export async function createRoom(name: string, description?: string, landmarks?: string[]): Promise<RoomDoc | null> {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const doc: RoomDoc = { name, description, landmarks, createdAt: now, updatedAt: now };
  const result = await db.collection<RoomDoc>(COLLECTIONS.rooms).insertOne(doc);
  return { ...doc, _id: String(result.insertedId) };
}

export async function updateRoom(
  id: string,
  patch: Partial<Pick<RoomDoc, "name" | "description" | "landmarks">>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.collection<RoomDoc>(COLLECTIONS.rooms).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } }
  );
  return result.matchedCount > 0;
}

export async function deleteRoom(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.collection<RoomDoc>(COLLECTIONS.rooms).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function getRoomById(id: string): Promise<RoomDoc | null> {
  const db = await getDb();
  if (!db) return null;

  return db.collection<RoomDoc>(COLLECTIONS.rooms).findOne({ _id: new ObjectId(id) });
}
