export const runtime = "nodejs";

import { NextResponse } from "next/server";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkAnthropic(): Promise<boolean> {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function checkGoogle(): Promise<boolean> {
  return Boolean(process.env.GOOGLE_API_KEY);
}

export async function GET() {
  const [ollama, anthropic, google] = await Promise.all([
    checkOllama(),
    checkAnthropic(),
    checkGoogle(),
  ]);

  return NextResponse.json({
    providers: [
      {
        id: "ollama",
        name: "Ollama",
        model:
          ollama && process.env.OLLAMA_MODEL_CONVERSATIONAL
            ? `${process.env.OLLAMA_MODEL_CONVERSATIONAL} · control: ${process.env.OLLAMA_MODEL_TECHNICAL || "qwen2.5:7b"}`
            : process.env.OLLAMA_MODEL_CONVERSATIONAL || "aya:8b",
        available: ollama,
        color: "#00e5a0",
      },
      {
        id: "anthropic",
        name: "Claude",
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        available: anthropic,
        color: "#d4a574",
      },
      {
        id: "google",
        name: "Google Gemini",
        model: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
        available: google,
        color: "#4285f4",
      },
    ],
  });
}
