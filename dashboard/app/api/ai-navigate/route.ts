export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  buildRobotContextBlock,
  obstacleFlags,
  pickBestDirection,
  type RobotContextPayload,
} from "@/lib/robot/contextPrompt";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const NAV_MODEL = process.env.OLLAMA_MODEL_TECHNICAL || "qwen2.5:7b";

interface NavDecision {
  direction: "forward" | "backward" | "left" | "right" | "stop";
  reason: string;
}

function fallbackDecision(ctx: RobotContextPayload): NavDecision {
  const best = pickBestDirection(ctx);
  if (!best) {
    return { direction: "stop", reason: "Toate direcțiile par blocate." };
  }
  return { direction: best, reason: `Cea mai liberă direcție: ${best}.` };
}

function parseDecision(raw: string, ctx: RobotContextPayload): NavDecision {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { direction?: string; reason?: string };
      const dir = parsed.direction?.toLowerCase();
      if (dir && ["forward", "backward", "left", "right", "stop"].includes(dir)) {
        return {
          direction: dir as NavDecision["direction"],
          reason: parsed.reason || "Decizie AI",
        };
      }
    } catch {
      /* fallback below */
    }
  }

  const tag = raw.match(/\[\[MOVE:(forward|backward|left|right|stop)(?::[^\]]+)?\]\]/i);
  if (tag) {
    return {
      direction: tag[1].toLowerCase() as NavDecision["direction"],
      reason: raw.replace(tag[0], "").trim() || "Decizie AI",
    };
  }

  return fallbackDecision(ctx);
}

function validateDecision(decision: NavDecision, ctx: RobotContextPayload): NavDecision {
  if (decision.direction === "stop") return decision;

  const flags = obstacleFlags(ctx.sensors, ctx.sensorMeta?.active);
  const blocked =
    (decision.direction === "forward" && flags.frontBlocked) ||
    (decision.direction === "backward" && flags.backBlocked) ||
    (decision.direction === "left" && flags.leftBlocked) ||
    (decision.direction === "right" && flags.rightBlocked);

  if (blocked) {
    const fb = fallbackDecision(ctx);
    return {
      direction: fb.direction,
      reason: `${decision.reason} (blocat — aleg ${fb.direction})`,
    };
  }
  return decision;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ctx = (body.robotContext || {}) as RobotContextPayload;

    const systemPrompt = `Ești navigația autonomă ROBO_V1. Analizezi senzorii montati și alegi UNA actiune pentru ~2 secunde.
Raspunde DOAR JSON: {"direction":"forward|backward|left|right|stop","reason":"scurt in romana"}
Reguli: nu alege directii cu obstacol <25cm; prefera inainte daca liber; ocoleste daca fata blocata.`;

    const userPrompt = `${buildRobotContextBlock(ctx)}

Alege urmatoarea actiune de navigare continua.`;

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: NAV_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const fb = fallbackDecision(ctx);
      return NextResponse.json({ ...fb, model: "fallback", provider: "rules" });
    }

    const data = await res.json();
    const raw = data.message?.content || "";
    const decision = validateDecision(parseDecision(raw, ctx), ctx);

    return NextResponse.json({
      ...decision,
      model: NAV_MODEL,
      provider: "ollama",
    });
  } catch (err) {
    return NextResponse.json(
      { direction: "stop", reason: String(err), model: "error", provider: "none" },
      { status: 500 }
    );
  }
}
