export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentRoomId, setCurrentRoomId } from "@/lib/context/current-room";
import { getRoomById } from "@/lib/rooms/store";

export async function GET() {
  const roomId = getCurrentRoomId();
  if (!roomId) return NextResponse.json({ roomId: null, room: null });

  const room = await getRoomById(roomId);
  return NextResponse.json({
    roomId,
    room: room ? { id: String(room._id), name: room.name, description: room.description } : null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { roomId } = (await request.json()) as { roomId?: string | null };
    if (!roomId) {
      setCurrentRoomId(null);
      return NextResponse.json({ ok: true, roomId: null });
    }
    const room = await getRoomById(roomId);
    if (!room) return NextResponse.json({ error: "Camera inexistentă" }, { status: 404 });
    setCurrentRoomId(roomId);
    return NextResponse.json({ ok: true, roomId, room: { id: roomId, name: room.name } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
