import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";
import path from "path";
import type { DetectedObject } from "@/app/types/robot";

const YOLO_PYTHON = process.env.YOLO_PYTHON || "python3";
const YOLO_SCRIPT = path.join(process.cwd(), "scripts/yolo_detect.py");
const YOLO_MODEL = process.env.YOLO_MODEL || "yolov8n.pt";
const YOLO_CONFIDENCE = process.env.YOLO_CONFIDENCE || "0.5";
const DETECT_INTERVAL_MS = parseInt(process.env.YOLO_DETECT_INTERVAL_MS || "1500", 10);

let worker: ChildProcessWithoutNullStreams | null = null;
let workerReady = false;
let pending: ((objects: DetectedObject[]) => void) | null = null;
let processing = false;
let lastDetectAt = 0;

export function isVisionOnPcEnabled(): boolean {
  return process.env.VISION_ON_PC !== "0";
}

function ensureWorker(): void {
  if (worker) return;

  worker = spawn(YOLO_PYTHON, [YOLO_SCRIPT], {
    env: { ...process.env, YOLO_MODEL, YOLO_CONFIDENCE },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const rl = readline.createInterface({ input: worker.stdout });

  rl.on("line", (line) => {
    try {
      const data = JSON.parse(line);
      if (data.ready !== undefined) {
        workerReady = Boolean(data.ready);
        if (data.error) console.warn("[Vision] YOLO worker:", data.error);
        else console.log("[Vision] YOLO worker ready on PC");
        return;
      }
      const objects = (data.objects as DetectedObject[]) || [];
      pending?.(objects);
      pending = null;
    } catch {
      pending?.([]);
      pending = null;
    }
  });

  worker.stderr.on("data", (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.warn("[Vision] YOLO:", msg.slice(0, 300));
  });

  worker.on("exit", () => {
    worker = null;
    workerReady = false;
    pending?.([]);
    pending = null;
  });
}

function runYolo(base64: string): Promise<DetectedObject[]> {
  ensureWorker();
  if (!worker || !workerReady) return Promise.resolve([]);

  return new Promise((resolve) => {
    pending = resolve;
    worker!.stdin.write(JSON.stringify({ image: base64 }) + "\n");
  });
}

export interface VisionEvent {
  event: string;
  label: string;
  confidence: number;
  timestamp: number;
  image?: string;
}

export interface VisionFrameResult {
  objects: DetectedObject[];
  events: VisionEvent[];
}

const EVENT_LABELS: Record<string, string> = {
  person: "person_detected",
};

function objectsToEvents(objects: DetectedObject[], image?: string): VisionEvent[] {
  const ts = Date.now();
  const seen = new Set<string>();
  const events: VisionEvent[] = [];

  for (const obj of objects) {
    const eventType = EVENT_LABELS[obj.label];
    if (!eventType || seen.has(eventType)) continue;
    seen.add(eventType);
    events.push({
      event: eventType,
      label: obj.label,
      confidence: obj.confidence,
      timestamp: ts,
      image,
    });
  }

  return events;
}

export async function processCameraFrame(base64: string): Promise<VisionFrameResult | null> {
  if (!isVisionOnPcEnabled()) return null;

  const now = Date.now();
  if (processing || now - lastDetectAt < DETECT_INTERVAL_MS) return null;

  processing = true;
  lastDetectAt = now;

  try {
    const objects = await runYolo(base64);
    const events = objectsToEvents(objects, base64);
    return { objects, events };
  } finally {
    processing = false;
  }
}
