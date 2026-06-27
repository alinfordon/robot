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

export interface SensorData {
  front_left: number;
  front_center: number;
  front_right: number;
  left: number;
  right: number;
  back_left: number;
  back_right: number;
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
  front_left: 999,
  front_center: 999,
  front_right: 999,
  left: 999,
  right: 999,
  back_left: 999,
  back_right: 999,
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
  objects: [],
  metrics: DEFAULT_METRICS,
  lastSeen: null,
  cameraFps: 0,
  uptime: 0,
};
