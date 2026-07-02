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
