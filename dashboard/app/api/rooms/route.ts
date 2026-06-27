export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createRoom, listRooms } from "@/lib/rooms/store";

export async function GET() {
  const rooms = await listRooms();
  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: String(r._id),
      name: r.name,
      description: r.description,
      landmarks: r.landmarks,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, landmarks } = body as {
      name?: string;
      description?: string;
      landmarks?: string[];
    };
    if (!name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const room = await createRoom(name.trim(), description, landmarks);
    if (!room) return NextResponse.json({ error: "MongoDB unavailable" }, { status: 503 });
    return NextResponse.json({ ok: true, room: { id: String(room._id), ...room } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
