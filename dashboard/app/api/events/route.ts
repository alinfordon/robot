export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { EventImportance } from "@/lib/mongodb/schemas";
import { listEvents } from "@/lib/events/store";

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "40", 10);
  const roomId = request.nextUrl.searchParams.get("roomId") || undefined;
  const importance = request.nextUrl.searchParams.get("importance") as EventImportance | null;
  const sinceHours = request.nextUrl.searchParams.get("sinceHours");
  const events = await listEvents({
    limit,
    roomId,
    importance: importance || ["medium", "high"],
    sinceHours: sinceHours ? parseInt(sinceHours, 10) : undefined,
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: String(e._id),
      ts: e.ts,
      type: e.type,
      source: e.source,
      summary: e.summary,
      importance: e.importance,
      roomId: e.roomId,
    })),
  });
}
