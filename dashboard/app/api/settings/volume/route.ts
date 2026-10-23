export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getVolume, setVolume } from "@/lib/settings/store";

const WS_HTTP = `http://localhost:${process.env.WS_PORT || "8080"}`;

async function syncRobot(volume: number): Promise<boolean> {
  try {
    const res = await fetch(`${WS_HTTP}/robot/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "SET_VOLUME",
        payload: { volume, source: "dashboard" },
      }),
    });
    const data = await res.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

export async function GET() {
  const volume = await getVolume();
  return NextResponse.json({ volume });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const volume = await setVolume(body.volume);
    const synced = await syncRobot(volume);
    return NextResponse.json({ volume, saved: true, synced });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
