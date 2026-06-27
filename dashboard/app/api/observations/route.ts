export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { listObservations } from "@/lib/observations/store";

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "30", 10);
  const roomId = request.nextUrl.searchParams.get("roomId") || undefined;
  const observations = await listObservations(limit, roomId);
  return NextResponse.json({
    observations: observations.map((o) => ({
      id: String(o._id),
      ts: o.ts,
      roomId: o.roomId,
      objectCount: o.objects.length,
      objects: o.objects.map((obj) => obj.label),
      state: o.state,
      mode: o.mode,
      mood: o.mood,
    })),
  });
}
