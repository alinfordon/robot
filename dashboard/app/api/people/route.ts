export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listPeople } from "@/lib/people/store";

export async function GET() {
  const people = await listPeople();
  return NextResponse.json({
    people: people.map((p) => ({
      id: String(p._id),
      name: p.name,
      aliases: p.aliases,
      notes: p.notes,
      lastSeenAt: p.lastSeenAt,
      hasFace: Boolean(p.faceEncodings?.length),
      encodingCount: p.faceEncodings?.length ?? 0,
    })),
  });
}
