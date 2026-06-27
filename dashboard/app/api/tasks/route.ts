export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { TaskStatus } from "@/lib/mongodb/schemas";
import { listTasks, updateTaskStatus } from "@/lib/tasks/store";

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "30", 10);
  const status = request.nextUrl.searchParams.get("status") as TaskStatus | null;
  const tasks = await listTasks(limit, status || undefined);
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: String(t._id),
      type: t.type,
      command: t.command,
      status: t.status,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      result: t.result,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, status, result } = (await request.json()) as {
      id?: string;
      status?: TaskStatus;
      result?: string;
    };
    if (!id || !status) {
      return NextResponse.json({ error: "id și status obligatorii" }, { status: 400 });
    }
    const ok = await updateTaskStatus(id, status, result);
    if (!ok) return NextResponse.json({ error: "Task negăsit" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
