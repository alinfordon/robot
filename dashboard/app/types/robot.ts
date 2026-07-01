export type Direction = "forward" | "backward" | "left" | "right" | "stop";
export type RobotMode = "auto" | "manual" | "vision" | "patrol";
export type RobotState =
  | "idle"
  | "moving"
  | "thinking"
  | "speaking"
  | "listening"
  | "avoiding"
  | "error";
export type Mood =
  | "happy"
  | "thinking"
  | "listening"
  | "talking"
  | "standby"
  | "alert";
export type Provider = "ollama" | "anthropic" | "google";
export type OllamaModelMode = "chat" | "control" | "auto";
export type LogLevel = "info" | "warn" | "error";

export type WheelSide = "left" | "right";

export interface WheelEncoderReading {
  pulses: number;
  rpm: number;
  cm_s: number;
  pps: number;
  gpio?: number;
  level?: boolean | null;
}

export interface EncoderData {
  left: WheelEncoderReading;
  right: WheelEncoderReading;
  speed_cm_s: number;
}

export interface EncoderMeta {
  active: WheelSide[];
  hardware: boolean;
  ppr: number;
}

export type UltrasonicId = "front" | "left" | "right" | "back";

export interface SensorData {
  front: number;
  left: number;
  right: number;
  back: number;
}

/** Care senzori sunt configurati activ pe robot (US_ACTIVE) + daca GPIO e OK. */
export interface SensorMeta {
  active: UltrasonicId[];
  hardware: boolean;
}

export interface DetectedObject {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface SystemMetrics {
  cpu: number;
  ram: number;
  temp: number;
  battery: number;
}

export interface RobotStatus {
  connected: boolean;
  state: RobotState;
  mood: Mood;
  mode: RobotMode;
  sensors: SensorData;
  sensorMeta: SensorMeta;
  encoders: EncoderData;
  encoderMeta: EncoderMeta;
  objects: DetectedObject[];
  metrics: SystemMetrics;
  lastSeen: Date | null;
  cameraFps: number;
  uptime: number;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  provider?: Provider;
  model?: string;
}

export interface ProviderConfig {
  id: Provider;
  name: string;
  model: string;
  available: boolean;
  color: string;
}

export interface WsMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  module: string;
  timestamp: Date;
}

export const DEFAULT_SENSORS: SensorData = {
  front: 999,
  left: 999,
  right: 999,
  back: 999,
};

export const DEFAULT_SENSOR_META: SensorMeta = {
  active: [],
  hardware: false,
};

export const DEFAULT_ENCODER_DATA: EncoderData = {
  left: { pulses: 0, rpm: 0, cm_s: 0, pps: 0 },
  right: { pulses: 0, rpm: 0, cm_s: 0, pps: 0 },
  speed_cm_s: 0,
};

export const DEFAULT_ENCODER_META: EncoderMeta = {
  active: [],
  hardware: false,
  ppr: 20,
};

export const DEFAULT_METRICS: SystemMetrics = {
  cpu: 0,
  ram: 0,
  temp: 0,
  battery: 100,
};

export const DEFAULT_ROBOT_STATUS: RobotStatus = {
  connected: false,
  state: "idle",
  mood: "standby",
  mode: "manual",
  sensors: DEFAULT_SENSORS,
  sensorMeta: DEFAULT_SENSOR_META,
  encoders: DEFAULT_ENCODER_DATA,
  encoderMeta: DEFAULT_ENCODER_META,
  objects: [],
  metrics: DEFAULT_METRICS,
  lastSeen: null,
  cameraFps: 0,
  uptime: 0,
};
