export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { enrollPerson } from "@/lib/people/store";
import { encodeFaceFromImage } from "@/lib/vision/face";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, imageBase64, bbox, notes, aliases } = body as {
      name?: string;
      imageBase64?: string;
      bbox?: [number, number, number, number];
      notes?: string;
      aliases?: string[];
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
    }

    const encoded = await encodeFaceFromImage(imageBase64, bbox);
    const fallback =
      (!encoded.faceFound || !encoded.encoding) && bbox
        ? await encodeFaceFromImage(imageBase64)
        : null;
    const result = fallback && fallback.encoding ? fallback : encoded;

    if (result.error === "worker not ready") {
      return NextResponse.json({ error: "Recunoașerea facială se încărcă — încearcă din nou." }, { status: 503 });
    }

    if (!result.faceFound || !result.encoding) {
      return NextResponse.json(
        { error: result.error || "Nu am găsit o față clară în imagine. Stai frontal, cu lumină bună." },
        { status: 422 }
      );
    }

    const person = await enrollPerson(name.trim(), result.encoding, { notes, aliases });
    if (!person) {
      return NextResponse.json({ error: "MongoDB unavailable" }, { status: 503 });
    }

    return NextResponse.json({ ok: true, person });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
