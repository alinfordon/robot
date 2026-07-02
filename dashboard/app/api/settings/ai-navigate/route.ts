export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAiNavigateEnabled, setAiNavigateEnabled } from "@/lib/settings/store";

const WS_HTTP = `http://localhost:${process.env.WS_PORT || "8080"}`;

async function syncRobot(enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${WS_HTTP}/robot/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SET_AI_NAVIGATE", payload: { enabled } }),
    });
    const data = await res.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

export async function GET() {
  const enabled = await getAiNavigateEnabled();
  return NextResponse.json({ enabled });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const enabled = Boolean(body.enabled);

    const saved = await setAiNavigateEnabled(enabled);
    const synced = await syncRobot(enabled);

    return NextResponse.json({
      enabled,
      saved,
      synced,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
