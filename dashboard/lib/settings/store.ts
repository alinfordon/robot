import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS, SettingsDoc } from "@/lib/mongodb/schemas";

const ROBOT_SETTINGS_ID = "robot";

export async function getAiNavigateEnabled(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const doc = await db.collection<SettingsDoc>(COLLECTIONS.settings).findOne({ _id: ROBOT_SETTINGS_ID });
  return Boolean(doc?.aiNavigateEnabled);
}

export async function setAiNavigateEnabled(enabled: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.collection<SettingsDoc>(COLLECTIONS.settings).updateOne(
    { _id: ROBOT_SETTINGS_ID },
    {
      $set: {
        aiNavigateEnabled: enabled,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  return true;
}

function clampVolume(value: unknown, fallback = 80): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function getVolume(): Promise<number> {
  const db = await getDb();
  if (!db) return 80;
  const doc = await db.collection<SettingsDoc>(COLLECTIONS.settings).findOne({ _id: ROBOT_SETTINGS_ID });
  return clampVolume(doc?.volume, 80);
}

export async function setVolume(volume: number): Promise<number> {
  const db = await getDb();
  const level = clampVolume(volume, 80);
  if (!db) return level;

  await db.collection<SettingsDoc>(COLLECTIONS.settings).updateOne(
    { _id: ROBOT_SETTINGS_ID },
    {
      $set: {
        volume: level,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  return level;
}
