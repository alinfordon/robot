import { getDb } from "@/lib/mongodb/client";
import { ensureIndexes } from "@/lib/mongodb/indexes";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Could not connect to MongoDB");
    process.exit(1);
  }

  await ensureIndexes(db);
  const { ensureDefaultRooms } = await import("@/lib/rooms/store");
  await ensureDefaultRooms();
  const collections = await db.listCollections().toArray();
  console.log(`Database: ${db.databaseName}`);
  console.log(`Collections: ${collections.map((c) => c.name).join(", ") || "(none yet)"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
