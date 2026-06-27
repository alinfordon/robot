export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createObjectManual, listObjects, updateObject } from "@/lib/objects/store";

export async function GET() {
  const objects = await listObjects();
  return NextResponse.json({
    objects: objects.map((o) => ({
      id: String(o._id),
      label: o.label,
      name: o.name,
      description: o.description,
      roomId: o.roomId,
      sightingCount: o.sightingCount,
      lastSeenAt: o.lastSeenAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, name, roomId, description } = body as {
      label?: string;
      name?: string;
      roomId?: string;
      description?: string;
    };
    if (!label?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "label și name obligatorii" }, { status: 400 });
    }
    const obj = await createObjectManual(label.trim(), name.trim(), roomId, description);
    if (!obj) return NextResponse.json({ error: "MongoDB unavailable" }, { status: 503 });
    return NextResponse.json({ ok: true, object: { id: String(obj._id), ...obj } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, roomId, label } = body as {
      id?: string;
      name?: string;
      description?: string;
      roomId?: string;
      label?: string;
    };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await updateObject(id, { name, description, roomId, label });
    if (!ok) return NextResponse.json({ error: "Obiect negăsit" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
