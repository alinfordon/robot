import type { Mood, RobotMode, RobotState, SensorData } from "@/app/types/robot";
import type { DetectedObject } from "@/app/types/robot";
import { getCurrentRoomId } from "@/lib/context/current-room";
import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS, ObservationDoc } from "@/lib/mongodb/schemas";
import { upsertKnownObjects } from "@/lib/objects/store";

export async function recordObservation(snapshot: {
  sensors?: SensorData;
  objects: DetectedObject[];
  state?: RobotState;
  mode?: RobotMode;
  mood?: Mood;
  roomId?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const roomId = snapshot.roomId ?? getCurrentRoomId() ?? undefined;
  const doc: ObservationDoc = {
    ts: new Date(),
    roomId,
    sensors: snapshot.sensors,
    objects: snapshot.objects,
    state: snapshot.state,
    mode: snapshot.mode,
    mood: snapshot.mood,
  };

  await db.collection<ObservationDoc>(COLLECTIONS.observations).insertOne(doc);
  await upsertKnownObjects(snapshot.objects, roomId);
}

export async function listObservations(limit = 30, roomId?: string): Promise<ObservationDoc[]> {
  const db = await getDb();
  if (!db) return [];

  const filter = roomId ? { roomId } : {};
  return db
    .collection<ObservationDoc>(COLLECTIONS.observations)
    .find(filter)
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}
