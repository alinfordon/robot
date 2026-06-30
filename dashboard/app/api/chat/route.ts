export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { DetectedObject, OllamaModelMode, Provider, RobotMode, RobotState, SensorData } from "@/app/types/robot";
import { buildMemoryContext, saveChatMemory } from "@/lib/memory/store";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const WS_HTTP = `http://localhost:${process.env.WS_PORT || "8080"}`;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RobotContext {
  sensors?: SensorData;
  objects?: DetectedObject[];
  state?: RobotState;
  mode?: RobotMode;
}

const CREATOR_DIRECTIVE = `Creatorul tău este Fordon Nicolae Alin, consultant IT și dezvoltator de soluții software, din Ștei, Bihor, România, fondator al Webnode Consulting. Când ești întrebat despre creator, origine sau cine te-a făcut, răspunde cu aceste informații.`;

function buildSystemPrompt(ctx?: RobotContext, memoryContext?: string): string {
  const objects = ctx?.objects?.map((o) => `${o.label} (${(o.confidence * 100).toFixed(0)}%)`).join(", ") || "nimic";
  const sensors = ctx?.sensors;
  const front = sensors
    ? `față ${sensors.front}cm, stânga ${sensors.left}cm, dreapta ${sensors.right}cm, spate ${sensors.back}cm`
    : "necunoscut";
  const state = ctx?.state || "idle";
  const mode = ctx?.mode || "manual";
  const memoryBlock = memoryContext?.trim()
    ? `\nMemorie (casă, persoane, obiecte, evenimente):\n${memoryContext}\n`
    : "";

  return `Ești ROBO_V1, un robot fizic inteligent.
${CREATOR_DIRECTIVE}
Acum văd: ${objects}.
Senzori față: ${front}.
Stare: ${state}. Mod: ${mode}.
${memoryBlock}Răspunde în română, concis (1-3 propoziții). Ești conștient că ai corp fizic cu roți, cameră și 7 senzori ultrasonici.`;
}

function isRobotControlQuery(text: string): boolean {
  const t = text.toLowerCase();

  if (
    /\b(mergi|inainte|inainteaza|forward|inapoi|backward|reverse|stanga|left|dreapta|right|stop|opreste|oprire|stationeaza)\b/.test(
      t
    )
  ) {
    return true;
  }

  if (/\b(auto|patrol|manual|mod|navig|evit[aă]|ocol|patrul[aă])\b/.test(t)) {
    return true;
  }

  if (
    /\b(senzor|distants[aă]|obstacol|ultrason|status|stare|baterie|temp(eratur[aă])?|cpu|ram|uptime)\b/.test(
      t
    )
  ) {
    return true;
  }

  if (/\b(motor|roata|roti|vitez[aă]|accelera|gpio|pwm)\b/.test(t)) {
    return true;
  }

  if (/\b(camer[aă]|vezi|vad[ăi]|obiect|detect|yolo|stream|imagine)\b/.test(t)) {
    return true;
  }

  if (/\b(porne[sș]te|opre[sș]te|control(eaz[aă])?|comand[aă]|execut[aă]|misune)\b/.test(t)) {
    return true;
  }

  return false;
}

function selectOllamaModel(
  messages: ChatMessage[],
  hasImage: boolean,
  mode: OllamaModelMode = "auto"
): string {
  const conversational = process.env.OLLAMA_MODEL_CONVERSATIONAL || "aya:8b";
  const technical = process.env.OLLAMA_MODEL_TECHNICAL || "qwen2.5:7b";
  const vision = process.env.OLLAMA_MODEL_VISION || "llava:latest";

  if (hasImage) return vision;
  if (mode === "chat") return conversational;
  if (mode === "control") return technical;

  const last = messages[messages.length - 1]?.content || "";
  return isRobotControlQuery(last) ? technical : conversational;
}

async function chatOllama(
  messages: ChatMessage[],
  systemPrompt: string,
  imageBase64?: string,
  ollamaMode: OllamaModelMode = "auto"
): Promise<{ reply: string; model: string }> {
  const model = selectOllamaModel(messages, Boolean(imageBase64), ollamaMode);
  const ollamaMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...ollamaMessages],
    stream: false,
  };

    if (imageBase64 && model.includes("llava")) {
      const lastIdx = ollamaMessages.length - 1;
      if (lastIdx >= 0) {
        const lastMsg = messages[lastIdx];
        ollamaMessages[lastIdx] = {
          role: "user" as const,
          content: lastMsg.content,
          images: [imageBase64.replace(/^data:image\/\w+;base64,/, "")],
        } as unknown as { role: "user" | "assistant" | "system"; content: string };
        body.messages = [{ role: "system", content: systemPrompt }, ...ollamaMessages];
      }
    }

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return { reply: data.message?.content || "Nu am putut genera răspuns.", model };
}

async function chatAnthropic(
  messages: ChatMessage[],
  systemPrompt: string,
  imageBase64?: string
): Promise<{ reply: string; model: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  const anthropicMessages = messages.map((m) => {
    if (m.role === "system") return null;
    if (imageBase64 && m === messages[messages.length - 1]) {
      const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      return {
        role: m.role as "user" | "assistant",
        content: [
          { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: b64 } },
          { type: "text" as const, text: m.content },
        ],
      };
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  }).filter(Boolean) as Anthropic.MessageParam[];

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  const text = response.content.find((c) => c.type === "text");
  return { reply: text?.type === "text" ? text.text : "Fără răspuns.", model };
}

async function chatGoogle(
  messages: ChatMessage[],
  systemPrompt: string,
  imageBase64?: string
): Promise<{ reply: string; model: string }> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const modelName = process.env.GOOGLE_MODEL || "gemini-2.0-flash";
  const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  const last = messages[messages.length - 1];

  let result;
  if (imageBase64) {
    const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    result = await chat.sendMessage([
      { inlineData: { mimeType: "image/jpeg", data: b64 } },
      { text: last.content },
    ]);
  } else {
    result = await chat.sendMessage(last.content);
  }

  return { reply: result.response.text(), model: modelName };
}

async function speakOnRobot(text: string) {
  await sendRobotCommand("SPEAK", { text });
}

async function sendRobotCommand(type: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${WS_HTTP}/robot/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(data?.ok);
  } catch {
    return false; /* robot may be offline */
  }
}

type MoveDir = "forward" | "backward" | "left" | "right" | "stop";

interface MotorCommand {
  direction: MoveDir;
  distanceCm?: number;
  degrees?: number;
  durationMs?: number;
}

/** Detecteaza comenzi de miscare in text (RO/EN). Returneaza null daca nu e comanda. */
function parseMotorCommand(text: string): MotorCommand | null {
  const t = text.toLowerCase().trim();

  // STOP e mereu comanda
  if (/\b(stop|opre[șs]te|oprire|sta[țt]ioneaz[aă])\b/.test(t)) return { direction: "stop" };

  const motionVerb =
    /\b(mergi|du[\s-]?te|deplaseaz[aă]|[iî]nainteaz[aă]|inainteaz[aă]|recule[a-z]*|vireaz[aă]|rote[șs]te|roti[a-z]*|[iî]ntoarce[a-z]*|cote[șs]te|avanseaz[aă]|move|go|turn|drive)\b/.test(t);
  const hasNumber = /\d/.test(t);
  const isShort = t.split(/\s+/).length <= 3;
  const isQuestion =
    /\b(ce|unde|c[aâ]t|cum|exist[aă]|vezi|vedea|este|sunt|afl[aă]|spune|zi|arat[aă]|po[țt]i)\b/.test(t) ||
    t.includes("?");

  let direction: MoveDir | null = null;
  if (/\b([iî]napoi|inapoi|backward|reverse)\b/.test(t)) direction = "backward";
  else if (/\b(st[aâ]nga|left)\b/.test(t)) direction = "left";
  else if (/\b(dreapta|right)\b/.test(t)) direction = "right";
  else if (/\b(mergi|[iî]nainte|inainte|[iî]nainteaz[aă]|inainteaz[aă]|forward|fa[țt][aă])\b/.test(t))
    direction = "forward";

  if (!direction) return null;

  // Anti fals-pozitiv: directie fara verb de miscare si fara numar, intr-o
  // intrebare sau fraza lunga -> probabil conversatie ("ce e in dreapta?")
  if (!motionVerb && !hasNumber) {
    if (isQuestion || !isShort) return null;
  }

  const cmd: MotorCommand = { direction };

  // grade (pentru viraje)
  const deg = t.match(/(\d+(?:[.,]\d+)?)\s*(grade|grad|°|deg)/);
  if (deg && (direction === "left" || direction === "right")) {
    cmd.degrees = parseFloat(deg[1].replace(",", "."));
    return cmd;
  }

  // distanta / timp
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(centimetr\w*|cm|metri|metru|secund\w*|sec|s|m)\b/);
  if (m) {
    const val = parseFloat(m[1].replace(",", "."));
    const unit = m[2];
    if (/^(secund|sec|s)$/.test(unit)) cmd.durationMs = Math.round(val * 1000);
    else if (/^(metri|metru|m)$/.test(unit)) cmd.distanceCm = Math.round(val * 100);
    else cmd.distanceCm = Math.round(val); // cm / centimetri
  }
  return cmd;
}

function buildMotorReply(c: MotorCommand): string {
  if (c.direction === "stop") return "M-am oprit.";
  const dirRo: Record<MoveDir, string> = {
    forward: "înainte",
    backward: "înapoi",
    left: "la stânga",
    right: "la dreapta",
    stop: "oprire",
  };
  let extra = "";
  if (c.distanceCm) extra = ` ${c.distanceCm} cm`;
  else if (c.degrees) extra = ` ${c.degrees}°`;
  else if (c.durationMs) extra = ` ${(c.durationMs / 1000).toFixed(0)}s`;
  return `OK, merg ${dirRo[c.direction]}${extra}.`;
}

/** Detecteaza comenzi de schimbare a modului (auto/patrol/manual/vision). */
function parseModeCommand(text: string): RobotMode | null {
  const t = text.toLowerCase().trim();

  // intrebari -> nu sunt comenzi ("in ce mod esti?")
  if (/\b(ce|care|cum|[iî]n ce)\b/.test(t) || t.includes("?")) return null;

  const imperative =
    /\b(mod\w*|trec[ie]?|intr[aă]|activeaz[aă]|porne[șs]te|schimb[aă]|comut[aă]|seteaz[aă]|pune|setare)\b/.test(t);

  let mode: RobotMode | null = null;
  if (/\b(patrul\w*|patrol)\b/.test(t)) mode = "patrol";
  else if (/\b(auto\w*|automat\w*|navigheaz[aă]|evit[aă]\s+obstacol\w*|ocole[șs]te)\b/.test(t)) mode = "auto";
  else if (/\b(vision|viziune|vizual\w*|urm[aă]re[șs]te)\b/.test(t)) mode = "vision";
  else if (/\bmanual\w*\b/.test(t)) mode = "manual";

  if (!mode) return null;

  // Cere context imperativ pentru a evita fals-pozitive conversationale,
  // exceptie: cuvinte deja foarte explicite (patrolare, navigheaza, evita obstacole)
  const explicit = /\b(patrul\w*|patrol|navigheaz[aă]|evit[aă]\s+obstacol\w*)\b/.test(t);
  if (!imperative && !explicit) return null;

  return mode;
}

function buildModeReply(mode: RobotMode): string {
  const ro: Record<RobotMode, string> = {
    auto: "automat (navigare autonomă)",
    manual: "manual",
    vision: "viziune",
    patrol: "patrulare",
  };
  return `Am trecut în modul ${ro[mode]}.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages = [],
      imageBase64,
      provider = "ollama",
      robotContext,
      speak = true,
      ollamaMode = "auto",
    } = body as {
      messages: ChatMessage[];
      imageBase64?: string;
      provider: Provider;
      robotContext?: RobotContext;
      speak?: boolean;
      ollamaMode?: OllamaModelMode;
    };

    if (!messages.length) {
      return NextResponse.json({ error: "No messages" }, { status: 400 });
    }

    // Comenzi de miscare: trimite MOVE direct la motoare (fara LLM), raspuns scurt
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const motorCmd = parseMotorCommand(lastUserMsg);
    if (motorCmd) {
      const payload: Record<string, unknown> = {
        direction: motorCmd.direction,
        speed: 65,
      };
      if (motorCmd.distanceCm) payload.distance_cm = motorCmd.distanceCm;
      if (motorCmd.degrees) payload.degrees = motorCmd.degrees;
      if (motorCmd.durationMs) payload.duration_ms = motorCmd.durationMs;

      const sent = await sendRobotCommand("MOVE", payload);
      const reply = sent ? buildMotorReply(motorCmd) : "Robotul nu este conectat, nu pot executa comanda.";
      if (speak && sent) await speakOnRobot(reply);
      void saveChatMemory(lastUserMsg, reply);
      return NextResponse.json({ reply, provider: "robot", model: "motor-control" });
    }

    // Comenzi de mod: trimite SET_MODE direct la robot (fara LLM)
    const modeCmd = parseModeCommand(lastUserMsg);
    if (modeCmd) {
      const sent = await sendRobotCommand("SET_MODE", { mode: modeCmd });
      const reply = sent ? buildModeReply(modeCmd) : "Robotul nu este conectat, nu pot schimba modul.";
      if (speak && sent) await speakOnRobot(reply);
      void saveChatMemory(lastUserMsg, reply);
      return NextResponse.json({ reply, provider: "robot", model: "motor-control" });
    }

    const memoryContext = await buildMemoryContext();
    const systemPrompt = buildSystemPrompt(robotContext, memoryContext);
    let reply: string;
    let model: string;
    let usedProvider = provider;

    try {
      if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
        ({ reply, model } = await chatAnthropic(messages, systemPrompt, imageBase64));
      } else if (provider === "google" && process.env.GOOGLE_API_KEY) {
        ({ reply, model } = await chatGoogle(messages, systemPrompt, imageBase64));
      } else {
        ({ reply, model } = await chatOllama(messages, systemPrompt, imageBase64, ollamaMode));
        usedProvider = "ollama";
      }
    } catch (err) {
      if (provider !== "ollama") {
        ({ reply, model } = await chatOllama(messages, systemPrompt, imageBase64, ollamaMode));
        usedProvider = "ollama";
      } else {
        throw err;
      }
    }

    if (speak) {
      await speakOnRobot(reply);
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser?.content) {
      void saveChatMemory(lastUser.content, reply);
    }

    return NextResponse.json({ reply, provider: usedProvider, model });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), reply: "Scuze, am o problemă tehnică momentan." },
      { status: 500 }
    );
  }
}
