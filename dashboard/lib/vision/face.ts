import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";
import path from "path";
import type { DetectedObject } from "@/app/types/robot";

const FACE_PYTHON = process.env.FACE_PYTHON || process.env.YOLO_PYTHON || "python3";
const FACE_SCRIPT = path.join(process.cwd(), "scripts/face_identify.py");

export interface KnownFacePerson {
  id: string;
  name: string;
  encodings: number[][];
}

export interface FaceIdentifyResult {
  faceFound: boolean;
  matched: boolean;
  personId?: string | null;
  name?: string | null;
  distance?: number | null;
  encoding?: number[] | null;
  error?: string;
}

export interface FaceEncodeResult {
  faceFound: boolean;
  encoding?: number[] | null;
  error?: string;
}

let worker: ChildProcessWithoutNullStreams | null = null;
let workerReady = false;
let pending: ((result: Record<string, unknown>) => void) | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWorkerReady(timeoutMs = 60000): Promise<boolean> {
  ensureWorker();
  const deadline = Date.now() + timeoutMs;
  while (!workerReady && Date.now() < deadline) {
    await sleep(100);
  }
  return workerReady;
}

export function isFaceRecognitionEnabled(): boolean {
  return process.env.FACE_RECOGNITION_ENABLED !== "0";
}

function ensureWorker(): void {
  if (worker) return;

  worker = spawn(FACE_PYTHON, [FACE_SCRIPT], {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const rl = readline.createInterface({ input: worker.stdout });

  rl.on("line", (line) => {
    try {
      const data = JSON.parse(line) as Record<string, unknown>;
      if (data.ready !== undefined) {
        workerReady = Boolean(data.ready);
        if (data.error) console.warn("[Face] worker:", data.error);
        else console.log("[Face] recognition worker ready on PC");
        return;
      }
      pending?.(data);
      pending = null;
    } catch {
      pending?.({ error: "parse error", matched: false, faceFound: false });
      pending = null;
    }
  });

  worker.stderr.on("data", (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.warn("[Face]:", msg.slice(0, 300));
  });

  worker.on("exit", () => {
    worker = null;
    workerReady = false;
    pending?.({ error: "worker exited", matched: false, faceFound: false });
    pending = null;
  });
}

function request(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return waitForWorkerReady().then((ready) => {
    if (!ready || !worker) {
      return { error: "worker not ready", matched: false, faceFound: false };
    }

    return new Promise((resolve) => {
      pending = resolve;
      worker!.stdin.write(JSON.stringify(payload) + "\n");
    });
  });
}

export async function identifyPersonInFrame(
  imageBase64: string,
  personDetection: DetectedObject,
  known: KnownFacePerson[]
): Promise<FaceIdentifyResult> {
  if (!isFaceRecognitionEnabled()) {
    return { faceFound: false, matched: false };
  }

  const data = await request({
    action: "identify",
    image: imageBase64,
    bbox: personDetection.bbox,
    known: known.map((p) => ({ id: p.id, name: p.name, encodings: p.encodings })),
  });

  return {
    faceFound: Boolean(data.faceFound),
    matched: Boolean(data.matched),
    personId: (data.personId as string) ?? null,
    name: (data.name as string) ?? null,
    distance: (data.distance as number) ?? null,
    encoding: (data.encoding as number[]) ?? null,
    error: data.error as string | undefined,
  };
}

export async function encodeFaceFromImage(
  imageBase64: string,
  bbox?: [number, number, number, number]
): Promise<FaceEncodeResult> {
  if (!isFaceRecognitionEnabled()) {
    return { faceFound: false, error: "face recognition disabled" };
  }

  const data = await request({
    action: "encode",
    image: imageBase64,
    bbox,
  });

  return {
    faceFound: Boolean(data.faceFound),
    encoding: (data.encoding as number[]) ?? null,
    error: data.error as string | undefined,
  };
}

if (isFaceRecognitionEnabled()) {
  ensureWorker();
}
