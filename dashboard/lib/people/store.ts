import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS, PersonDoc } from "@/lib/mongodb/schemas";
import type { FaceIdentifyResult } from "@/lib/vision/face";
import { recordEvent } from "@/lib/events/store";
import { saveMemory } from "@/lib/memories/store";

export interface KnownFacePerson {
  id: string;
  name: string;
  encodings: number[][];
}

export async function getPeopleWithEncodings(): Promise<KnownFacePerson[]> {
  const db = await getDb();
  if (!db) return [];

  const docs = await db
    .collection<PersonDoc>(COLLECTIONS.people)
    .find({ name: { $ne: "necunoscut" }, faceEncodings: { $exists: true, $ne: [] } })
    .toArray();

  return docs
    .filter((d) => d._id && d.faceEncodings?.length)
    .map((d) => ({
      id: String(d._id),
      name: d.name,
      encodings: d.faceEncodings!,
    }));
}

export async function enrollPerson(
  name: string,
  encoding: number[],
  opts?: { notes?: string; aliases?: string[] }
): Promise<{ id: string; name: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const col = db.collection<PersonDoc>(COLLECTIONS.people);

  const existing = await col.findOne({ name });
  if (existing) {
    await col.updateOne(
      { _id: existing._id },
      {
        $push: { faceEncodings: encoding },
        $set: { updatedAt: now, ...(opts?.notes ? { notes: opts.notes } : {}) },
      }
    );
    return { id: String(existing._id), name };
  }

  const doc: PersonDoc = {
    name,
    aliases: opts?.aliases,
    notes: opts?.notes,
    faceEncodings: [encoding],
    createdAt: now,
    updatedAt: now,
  };

  const result = await col.insertOne(doc);
  await saveMemory(`Persoană înregistrată: ${name}`, `Fața lui ${name} a fost adăugată în memoria robotului.`, {
    tags: ["people", "enroll"],
  });

  return { id: String(result.insertedId), name };
}

export async function handlePersonIdentification(
  result: FaceIdentifyResult
): Promise<{ name: string | null; greeting: string | null }> {
  const db = await getDb();
  if (!db) return { name: null, greeting: null };

  const now = new Date();

  if (result.matched && result.personId && result.name) {
    await db.collection<PersonDoc>(COLLECTIONS.people).updateOne(
      { _id: new ObjectId(result.personId) },
      { $set: { lastSeenAt: now, updatedAt: now } }
    );

    await recordEvent(
      "person_identified",
      {
        personId: result.personId,
        name: result.name,
        distance: result.distance,
      },
      "ai",
      `${result.name} recunoscut(ă) vizual`
    );

    await saveMemory(
      `${result.name} văzut(ă) recent`,
      `Am recunoscut pe ${result.name} (distanta fata: ${result.distance?.toFixed(2) ?? "?"})`,
      { tags: ["people", "vision"], peopleIds: [result.personId] }
    );

    return {
      name: result.name,
      greeting: `Bună, ${result.name}!`,
    };
  }

  if (result.faceFound) {
    await db.collection<PersonDoc>(COLLECTIONS.people).updateOne(
      { name: "necunoscut" },
      {
        $set: { lastSeenAt: now, updatedAt: now },
        $setOnInsert: {
          name: "necunoscut",
          notes: "Față detectată, persoană neînregistrată",
          createdAt: now,
        },
      },
      { upsert: true }
    );

    await recordEvent(
      "person_detected",
      { identified: false, faceFound: true },
      "ai",
      "Persoană necunoscută detectată"
    );

    return { name: null, greeting: "Bună! Nu te-am recunoscut încă." };
  }

  await recordEvent(
    "person_detected",
    { identified: false, faceFound: false },
    "ai",
    "Persoană detectată (fără față clară)"
  );

  return { name: null, greeting: "Bună! Te-am observat." };
}

export async function listPeople(): Promise<PersonDoc[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .collection<PersonDoc>(COLLECTIONS.people)
    .find({ name: { $ne: "necunoscut" } })
    .sort({ lastSeenAt: -1, name: 1 })
    .toArray();
}
