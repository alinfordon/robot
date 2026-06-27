export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { translateText, type TranslateLang } from "@/lib/translate/argos";
import { detectLang, oppositeLang } from "@/lib/translate/detectLang";

function parseLang(value: unknown): TranslateLang | "auto" | null {
  if (value === "auto") return "auto";
  if (value === "ro" || value === "en") return value;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = String(body.text || "").trim();
    const fromRaw = parseLang(body.from);
    const toRaw = parseLang(body.to);

    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const from: TranslateLang =
      fromRaw === "auto" || fromRaw === null ? detectLang(text) : fromRaw;
    const to: TranslateLang =
      toRaw === "auto" || toRaw === null ? oppositeLang(from) : toRaw === from ? oppositeLang(from) : toRaw;

    if (from === to) {
      return NextResponse.json({
        ok: true,
        original: text,
        translated: text,
        from,
        to: oppositeLang(from),
        detected: fromRaw === "auto" || fromRaw === null,
      });
    }

    const result = await translateText(text, from, to);

    if (result.error === "worker not ready") {
      return NextResponse.json({ error: "Traducătorul se încarcă — încearcă din nou." }, { status: 503 });
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      original: text,
      translated: result.text,
      from,
      to,
      detected: fromRaw === "auto" || fromRaw === null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
