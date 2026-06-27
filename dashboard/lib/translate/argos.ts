import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";
import path from "path";

const TRANSLATE_PYTHON = process.env.TRANSLATE_PYTHON || process.env.YOLO_PYTHON || "python";
const TRANSLATE_SCRIPT = path.join(process.cwd(), "scripts/argos_translate.py");

export type TranslateLang = "ro" | "en";

export interface TranslateResult {
  text: string;
  from: TranslateLang;
  to: TranslateLang;
  error?: string;
}

let worker: ChildProcessWithoutNullStreams | null = null;
let workerReady = false;
let pending: ((result: TranslateResult) => void) | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureWorker(): void {
  if (worker) return;

  worker = spawn(TRANSLATE_PYTHON, [TRANSLATE_SCRIPT], {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const rl = readline.createInterface({ input: worker.stdout });

  rl.on("line", (line) => {
    try {
      const data = JSON.parse(line) as Record<string, unknown>;
      if (data.ready !== undefined) {
        workerReady = Boolean(data.ready);
        if (data.error) console.warn("[Translate] Argos worker:", data.error);
        else console.log("[Translate] Argos worker ready (ro ↔ en)");
        return;
      }

      pending?.({
        text: String(data.text || ""),
        from: (data.from as TranslateLang) || "ro",
        to: (data.to as TranslateLang) || "en",
        error: data.error ? String(data.error) : undefined,
      });
      pending = null;
    } catch {
      pending?.({ text: "", from: "ro", to: "en", error: "parse error" });
      pending = null;
    }
  });

  worker.stderr.on("data", (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.warn("[Translate]:", msg.slice(0, 300));
  });

  worker.on("exit", () => {
    worker = null;
    workerReady = false;
    pending?.({ text: "", from: "ro", to: "en", error: "worker exited" });
    pending = null;
  });
}

async function waitForWorkerReady(timeoutMs = 120000): Promise<boolean> {
  ensureWorker();
  const deadline = Date.now() + timeoutMs;
  while (!workerReady && Date.now() < deadline) {
    await sleep(200);
  }
  return workerReady;
}

function request(from: TranslateLang, to: TranslateLang, text: string): Promise<TranslateResult> {
  return waitForWorkerReady().then((ready) => {
    if (!ready || !worker) {
      return { text: "", from, to, error: "worker not ready" };
    }

    return new Promise((resolve) => {
      pending = resolve;
      worker!.stdin.write(JSON.stringify({ from, to, text }) + "\n");
    });
  });
}

export async function translateText(
  text: string,
  from: TranslateLang,
  to: TranslateLang
): Promise<TranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { text: "", from, to };
  }
  if (from === to) {
    return { text: trimmed, from, to };
  }
  return request(from, to, trimmed);
}

ensureWorker();
