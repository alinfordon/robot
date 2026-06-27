import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb/client";
import { COLLECTIONS, TaskDoc, TaskStatus } from "@/lib/mongodb/schemas";

export async function createTask(
  type: string,
  command: string,
  params?: Record<string, unknown>
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const doc: TaskDoc = {
    type,
    command,
    params,
    status: "pending",
    createdAt: new Date(),
  };

  const result = await db.collection<TaskDoc>(COLLECTIONS.tasks).insertOne(doc);
  return String(result.insertedId);
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  result?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const patch: Partial<TaskDoc> = { status };
  if (status === "done" || status === "failed") {
    patch.completedAt = new Date();
    if (result) patch.result = result;
  }

  const res = await db.collection<TaskDoc>(COLLECTIONS.tasks).updateOne(
    { _id: new ObjectId(id) },
    { $set: patch }
  );
  return res.matchedCount > 0;
}

export async function markTaskSent(id: string): Promise<void> {
  await updateTaskStatus(id, "running");
}

export async function markTaskDone(id: string, result = "trimis la robot"): Promise<void> {
  await updateTaskStatus(id, "done", result);
}

export async function listTasks(limit = 30, status?: TaskStatus): Promise<TaskDoc[]> {
  const db = await getDb();
  if (!db) return [];

  const filter = status ? { status } : {};
  return db.collection<TaskDoc>(COLLECTIONS.tasks).find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function getPendingTaskCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  return db.collection(COLLECTIONS.tasks).countDocuments({ status: { $in: ["pending", "running"] } });
}
