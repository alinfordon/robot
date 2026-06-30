import {
  DEFAULT_SENSOR_META,
  DEFAULT_SENSORS,
  SensorData,
  SensorMeta,
  UltrasonicId,
} from "@/app/types/robot";

const IDS: UltrasonicId[] = ["front", "left", "right", "back"];

function num(v: unknown, fallback = 999): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

/** Normalizeaza payload SENSORS (format robot 4x HC-SR04 sau legacy 7 senzori). */
export function parseSensorsPayload(payload: Record<string, unknown>): {
  sensors: SensorData;
  meta: SensorMeta;
} {
  const sensors: SensorData = {
    front: num(payload.front ?? payload.front_center),
    left: num(payload.left),
    right: num(payload.right),
    back: num(payload.back ?? payload.back_left),
  };

  const activeRaw = payload.active;
  let active: UltrasonicId[] = Array.isArray(activeRaw)
    ? activeRaw.filter((id): id is UltrasonicId => IDS.includes(id as UltrasonicId))
    : [];

  // Payload vechi (fara meta): marcheaza senzorii prezenti in mesaj
  if (active.length === 0 && !("active" in payload)) {
    active = IDS.filter((id) => payload[id] !== undefined);
  }

  const meta: SensorMeta = {
    active,
    hardware: "hardware" in payload ? Boolean(payload.hardware) : active.length > 0,
  };

  return { sensors, meta };
}

export { DEFAULT_SENSORS, DEFAULT_SENSOR_META };
