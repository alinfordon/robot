import {
  DEFAULT_ENCODER_DATA,
  DEFAULT_ENCODER_META,
  EncoderData,
  EncoderMeta,
  WheelEncoderReading,
  WheelSide,
} from "@/app/types/robot";

const SIDES: WheelSide[] = ["left", "right"];

function wheel(raw: unknown): WheelEncoderReading {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    pulses: typeof o.pulses === "number" ? o.pulses : 0,
    rpm: typeof o.rpm === "number" ? o.rpm : 0,
    cm_s: typeof o.cm_s === "number" ? o.cm_s : 0,
    pps: typeof o.pps === "number" ? o.pps : 0,
    gpio: typeof o.gpio === "number" ? o.gpio : undefined,
    level: typeof o.level === "boolean" ? o.level : o.level === null ? null : undefined,
  };
}

export function parseEncodersPayload(payload: Record<string, unknown>): {
  encoders: EncoderData;
  meta: EncoderMeta;
} {
  const activeRaw = payload.active;
  let active: WheelSide[] = Array.isArray(activeRaw)
    ? activeRaw.filter((id): id is WheelSide => SIDES.includes(id as WheelSide))
    : [];

  if (active.length === 0 && !("active" in payload)) {
    active = SIDES.filter((id) => payload[id] !== undefined || payload[`${id}_rpm`] !== undefined);
  }

  const encoders: EncoderData = {
    left: wheel(payload.left),
    right: wheel(payload.right),
    speed_cm_s: typeof payload.speed_cm_s === "number" ? payload.speed_cm_s : 0,
  };

  const meta: EncoderMeta = {
    active,
    hardware: "hardware" in payload ? Boolean(payload.hardware) : active.length > 0,
    ppr: typeof payload.ppr === "number" ? payload.ppr : 20,
  };

  return { encoders, meta };
}

export { DEFAULT_ENCODER_DATA, DEFAULT_ENCODER_META };
