export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

const WS_HTTP = `http://localhost:${process.env.WS_PORT || "8080"}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, payload } = body;

    if (!type) {
      return NextResponse.json({ error: "Missing type" }, { status: 400 });
    }

    const res = await fetch(`${WS_HTTP}/robot/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload: payload || {} }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const res = await fetch(`${WS_HTTP}/robot/status`, { cache: "no-store" });
    const status = await res.json();
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ connected: false });
  }
}
