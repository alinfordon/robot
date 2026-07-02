import type {
  EncoderData,
  EncoderMeta,
  Mood,
  RobotMode,
  RobotState,
  SensorData,
  SensorMeta,
  SystemMetrics,
  DetectedObject,
  UltrasonicId,
} from "@/app/types/robot";

export interface RobotContextPayload {
  sensors?: SensorData;
  sensorMeta?: SensorMeta;
  encoders?: EncoderData;
  encoderMeta?: EncoderMeta;
  objects?: DetectedObject[];
  state?: RobotState;
  mode?: RobotMode;
  mood?: Mood;
  metrics?: SystemMetrics;
  uptime?: number;
  connected?: boolean;
}

const US_NAMES: Record<UltrasonicId, string> = {
  front: "față",
  left: "stânga",
  right: "dreapta",
  back: "spate",
};

const OBSTACLE_CM = 25;
const WARNING_CM = 50;

function fmtDist(cm: number | undefined): string {
  if (cm === undefined || cm === null) return "necunoscut";
  if (cm >= 999) return "fără ecou";
  return `${Math.round(cm)} cm`;
}

function sensorLine(id: UltrasonicId, cm: number | undefined, active: boolean): string {
  if (!active) return `- ${US_NAMES[id]}: neconectat`;
  const d = fmtDist(cm);
  let note = "";
  if (cm !== undefined && cm < 999) {
    if (cm < OBSTACLE_CM) note = " — OBSTACOL APROPIAT";
    else if (cm < WARNING_CM) note = " — atenție";
    else note = " — liber";
  }
  return `- ${US_NAMES[id]}: ${d}${note}`;
}

export function obstacleFlags(sensors?: SensorData, active?: UltrasonicId[]): {
  frontBlocked: boolean;
  backBlocked: boolean;
  leftBlocked: boolean;
  rightBlocked: boolean;
  anyBlocked: boolean;
} {
  const act = new Set(active?.length ? active : (["front", "left", "right", "back"] as UltrasonicId[]));
  const blocked = (id: UltrasonicId, v?: number) =>
    act.has(id) && v !== undefined && v < 999 && v < OBSTACLE_CM;

  const frontBlocked = blocked("front", sensors?.front);
  const backBlocked = blocked("back", sensors?.back);
  const leftBlocked = blocked("left", sensors?.left);
  const rightBlocked = blocked("right", sensors?.right);

  return {
    frontBlocked,
    backBlocked,
    leftBlocked,
    rightBlocked,
    anyBlocked: frontBlocked || backBlocked || leftBlocked || rightBlocked,
  };
}

export function buildRobotContextBlock(ctx?: RobotContextPayload): string {
  if (!ctx) return "Context senzori: indisponibil (robot offline sau fără date).";

  const active = ctx.sensorMeta?.active?.length
    ? ctx.sensorMeta.active
    : (["front", "left", "right", "back"] as UltrasonicId[]);
  const usHw = ctx.sensorMeta?.hardware ? "GPIO activ" : "simulare/fără GPIO";

  const sensorLines = (["front", "left", "right", "back"] as UltrasonicId[]).map((id) =>
    sensorLine(id, ctx.sensors?.[id], active.includes(id))
  );

  const flags = obstacleFlags(ctx.sensors, active);
  const safety: string[] = [];
  if (flags.frontBlocked) safety.push("NU merge înainte — obstacol față");
  if (flags.backBlocked) safety.push("NU merge înapoi — obstacol spate");
  if (flags.leftBlocked) safety.push("atentie stânga");
  if (flags.rightBlocked) safety.push("atentie dreapta");

  const encActive = ctx.encoderMeta?.active?.length ? ctx.encoderMeta.active : [];
  const encHw = ctx.encoderMeta?.hardware ? "GPIO OK" : "fără GPIO";
  let encoderBlock = "Encodere: neconfigurate.";
  if (encActive.length) {
    const l = ctx.encoders?.left;
    const r = ctx.encoders?.right;
    encoderBlock = [
      `Encodere OKY3278 (${encHw}, PPR ${ctx.encoderMeta?.ppr ?? 20}):`,
      encActive.includes("left")
        ? `  stânga GPIO${l?.gpio ?? 20}: ${l?.pulses ?? 0} imp, ${(l?.cm_s ?? 0).toFixed(1)} cm/s`
        : "  stânga: dezactivat",
      encActive.includes("right")
        ? `  dreapta GPIO${r?.gpio ?? 16}: ${r?.pulses ?? 0} imp, ${(r?.cm_s ?? 0).toFixed(1)} cm/s`
        : "  dreapta: dezactivat",
      `  viteză medie: ${(ctx.encoders?.speed_cm_s ?? 0).toFixed(1)} cm/s`,
    ].join("\n");
  }

  const objects =
    ctx.objects?.map((o) => `${o.label} (${(o.confidence * 100).toFixed(0)}%)`).join(", ") || "nimic detectat";

  const metrics = ctx.metrics;
  const sysLine = metrics
    ? `Sistem: CPU ${metrics.cpu.toFixed(0)}%, RAM ${metrics.ram.toFixed(0)}%, ${metrics.temp.toFixed(0)}°C` +
      (ctx.uptime ? `, uptime ${Math.round(ctx.uptime)}s` : "")
    : "";

  return [
    `Hardware montat:`,
    `- Ultrasonice HC-SR04 (${usHw}): ${active.map((id) => US_NAMES[id]).join(", ") || "niciunul"}`,
    `- ${encoderBlock.split("\n")[0]}`,
    "",
    "Citiri ultrasonice acum:",
    ...sensorLines,
    "",
    encoderBlock.includes("\n") ? encoderBlock : "",
    `Viziune (YOLO): ${objects}.`,
    sysLine,
    `Stare: ${ctx.state || "idle"}. Mod: ${ctx.mode || "manual"}. Stare afectivă: ${ctx.mood || "standby"}.`,
    safety.length ? `Restricții navigație: ${safety.join("; ")}.` : "Navigație: toate direcțiile par libere (>25 cm).",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSystemPrompt(ctx?: RobotContextPayload, memoryContext?: string): string {
  const memoryBlock = memoryContext?.trim()
    ? `\nMemorie (casă, persoane, obiecte, evenimente):\n${memoryContext}\n`
    : "";

  const contextBlock = buildRobotContextBlock(ctx);

  return `Ești ROBO_V1 (Ody_V1), un robot fizic mobil cu roți, cameră și senzori montați.
Creator: Fordon Nicolae Alin, consultant IT, Ștei, Bihor, România, Webnode Consulting.

${contextBlock}
${memoryBlock}
Reguli:
1. Folosește citirile senzorilor de mai sus pentru răspunsuri și decizii — nu inventa distanțe.
2. Dacă o direcție are obstacol (<25 cm) sau fără ecou, avertizează explicit.
3. Răspunde în română, concis (1-4 propoziții), ca un robot care simte mediul.
4. Când utilizatorul cere o acțiune fizică (mișcare) ȘI senzorii permit, adaugă LA FINAL exact un tag:
   [[MOVE:forward]] [[MOVE:backward]] [[MOVE:left]] [[MOVE:right]] [[MOVE:stop]]
   Opțional: [[MOVE:forward:50cm]] [[MOVE:left:90deg]] [[MOVE:forward:2s]]
   NU adăuga tag dacă direcția e blocată — explică de ce.
5. Pentru întrebări despre mediu ("ce e în față", "pot merge"), analizează senzorii și obiectele detectate.`;
}

export function parseAiMoveTags(text: string): {
  cleanText: string;
  actions: Array<{ direction: string; distanceCm?: number; degrees?: number; durationMs?: number }>;
} {
  const actions: Array<{ direction: string; distanceCm?: number; degrees?: number; durationMs?: number }> = [];
  const re = /\[\[MOVE:(forward|backward|left|right|stop)(?::(\d+(?:\.\d+)?)\s*(cm|m|deg|s|sec))?\]\]/gi;

  let cleanText = text;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const direction = match[1].toLowerCase();
    const val = match[2] ? parseFloat(match[2]) : undefined;
    const unit = match[3]?.toLowerCase();
    const action: { direction: string; distanceCm?: number; degrees?: number; durationMs?: number } = {
      direction,
    };
    if (val !== undefined && unit) {
      if (unit === "cm") action.distanceCm = Math.round(val);
      else if (unit === "m") action.distanceCm = Math.round(val * 100);
      else if (unit === "deg") action.degrees = val;
      else if (unit === "s" || unit === "sec") action.durationMs = Math.round(val * 1000);
    }
    actions.push(action);
  }

  cleanText = text.replace(re, "").replace(/\s{2,}/g, " ").trim();
  return { cleanText, actions };
}

export function isConditionalMoveRequest(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(dac[aă]|c[aâ]nd|numai|doar|poate|liber|sigur|verific[aă]|f[aă]r[aă]\s+obstacol|evit[aă]|ocol)\b/.test(t) ||
    t.includes("?")
  );
}

export function pickBestDirection(ctx?: RobotContextPayload): "forward" | "left" | "right" | "backward" | null {
  const sensors = ctx?.sensors;
  const active = ctx?.sensorMeta?.active?.length
    ? ctx.sensorMeta.active
    : (["front", "left", "right", "back"] as UltrasonicId[]);

  const dist = (id: UltrasonicId): number => {
    if (!active.includes(id)) return 0;
    const v = sensors?.[id];
    if (v === undefined || v >= 999) return 0;
    return v;
  };

  const all: { dir: "forward" | "left" | "right" | "backward"; cm: number }[] = [
    { dir: "forward", cm: dist("front") },
    { dir: "left", cm: dist("left") },
    { dir: "right", cm: dist("right") },
    { dir: "backward", cm: dist("back") },
  ];
  const candidates = all.filter((c) => c.cm >= OBSTACLE_CM);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.cm - a.cm);
  return candidates[0].dir;
}
