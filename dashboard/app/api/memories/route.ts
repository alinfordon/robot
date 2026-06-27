export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { consolidateRecentEvents, listMemories } from "@/lib/memories/store";

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "30", 10);
  const tag = request.nextUrl.searchParams.get("tag") || undefined;
  const memories = await listMemories(limit, tag);
  return NextResponse.json({
    memories: memories.map((m) => ({
      id: String(m._id),
      ts: m.ts,
      summary: m.summary,
      content: m.content,
      tags: m.tags,
      roomId: m.roomId,
      sourceEventCount: m.sourceEventIds?.length ?? 0,
    })),
  });
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("action") !== "consolidate") {
    return NextResponse.json({ error: "Use ?action=consolidate" }, { status: 400 });
  }
  const result = await consolidateRecentEvents();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, summary: result.summary });
}
