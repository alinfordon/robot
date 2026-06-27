import { MongoClient, Db } from "mongodb";

const URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "robo_v1";

let client: MongoClient | null = null;
let db: Db | null = null;
let indexesReady = false;

export async function getDb(): Promise<Db | null> {
  if (process.env.MONGODB_ENABLED === "0") return null;

  if (db) return db;

  try {
    client = new MongoClient(URI, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    db = client.db(DB_NAME);

    if (!indexesReady) {
      const { ensureIndexes } = await import("./indexes");
      await ensureIndexes(db);
      indexesReady = true;
    }

    return db;
  } catch (err) {
    console.warn("[MongoDB] Connection failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    indexesReady = false;
  }
}
