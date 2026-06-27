import type { DetectedObject, Mood, RobotMode, RobotState, SensorData } from "@/app/types/robot";

export const COLLECTIONS = {
  people: "people",
  rooms: "rooms",
  objects: "objects",
  observations: "observations",
  events: "events",
  tasks: "tasks",
  memories: "memories",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export interface PersonDoc {
  _id?: string;
  name: string;
  aliases?: string[];
  notes?: string;
  roomId?: string;
  /** 128-d face vectors from face_recognition */
  faceEncodings?: number[][];
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomDoc {
  _id?: string;
  name: string;
  description?: string;
  landmarks?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Canonical world knowledge — TV, canapea, frigider */
export interface ObjectDoc {
  _id?: string;
  label: string;
  name?: string;
  roomId?: string;
  description?: string;
  lastSeenAt?: Date;
  sightingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Ephemeral snapshot — what the robot sees right now */
export interface ObservationDoc {
  _id?: string;
  ts: Date;
  roomId?: string;
  sensors?: SensorData;
  objects: DetectedObject[];
  state?: RobotState;
  mode?: RobotMode;
  mood?: Mood;
}

export type EventSource = "robot" | "dashboard" | "ai";
export type EventImportance = "low" | "medium" | "high";

/** Important things that happened */
export interface EventDoc {
  _id?: string;
  ts: Date;
  type: string;
  source: EventSource;
  summary?: string;
  payload: Record<string, unknown>;
  importance: EventImportance;
  roomId?: string;
}

export type TaskStatus = "pending" | "running" | "done" | "failed";

export interface TaskDoc {
  _id?: string;
  type: string;
  command: string;
  params?: Record<string, unknown>;
  status: TaskStatus;
  createdAt: Date;
  completedAt?: Date;
  result?: string;
}

/** AI-generated summaries from events — long-term recall */
export interface MemoryDoc {
  _id?: string;
  ts: Date;
  content: string;
  summary: string;
  sourceEventIds?: string[];
  tags?: string[];
  roomId?: string;
  peopleIds?: string[];
}
