"use client";

import { useReducer, useCallback, useEffect, useRef } from "react";
import {
  DEFAULT_ROBOT_STATUS,
  DetectedObject,
  LogEntry,
  Message,
  Mood,
  RobotMode,
  RobotState,
  RobotStatus,
  SensorData,
  SensorMeta,
  SystemMetrics,
  WsMessage,
} from "@/app/types/robot";
import { parseSensorsPayload } from "@/lib/sensors/parse";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

interface WsState {
  connected: boolean;
  robotStatus: RobotStatus;
  logs: LogEntry[];
  messages: Message[];
  cameraFrame: string | null;
  cameraSize: { width: number; height: number };
  latency: number;
  typing: boolean;
  lastAiResponse: {
    id: number;
    text: string;
    spokenOnRobot: boolean;
  } | null;
  lastSpeechRecognized: {
    id: number;
    text: string;
    route: string;
  } | null;
}

type WsAction =
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "UPDATE_STATUS"; payload: Partial<RobotStatus> }
  | { type: "SENSORS"; payload: { sensors: SensorData; meta: SensorMeta } }
  | { type: "OBJECTS"; payload: DetectedObject[] }
  | { type: "STATE"; payload: { state?: RobotState; mood?: Mood; mode?: RobotMode } }
  | { type: "SYSTEM"; payload: SystemMetrics & { uptime?: number } }
  | { type: "LOG"; payload: LogEntry }
  | { type: "CAMERA"; payload: { base64: string; width: number; height: number } }
  | {
      type: "AI_RESPONSE";
      payload: {
        text: string;
        model?: string;
        provider?: string;
        spokenOnRobot?: boolean;
      };
    }
  | { type: "SPEECH"; payload: { text: string } }
  | { type: "SPEECH_RECOGNIZED"; payload: { text: string; route: string } }
  | { type: "ADD_MESSAGE"; payload: Message }
  | { type: "SET_TYPING"; payload: boolean }
  | { type: "SET_LATENCY"; payload: number };

const initialState: WsState = {
  connected: false,
  robotStatus: { ...DEFAULT_ROBOT_STATUS },
  logs: [],
  messages: [],
  cameraFrame: null,
  cameraSize: { width: 640, height: 480 },
  latency: 0,
  typing: false,
  lastAiResponse: null,
  lastSpeechRecognized: null,
};

function reducer(state: WsState, action: WsAction): WsState {
  switch (action.type) {
    case "CONNECTED":
      return { ...state, connected: true };
    case "DISCONNECTED":
      return {
        ...state,
        connected: false,
        robotStatus: { ...state.robotStatus, connected: false },
      };
    case "UPDATE_STATUS":
      return {
        ...state,
        robotStatus: { ...state.robotStatus, ...action.payload, lastSeen: new Date() },
      };
    case "SENSORS":
      return {
        ...state,
        robotStatus: {
          ...state.robotStatus,
          sensors: action.payload.sensors,
          sensorMeta: action.payload.meta,
          lastSeen: new Date(),
        },
      };
    case "OBJECTS":
      return {
        ...state,
        robotStatus: {
          ...state.robotStatus,
          objects: action.payload,
          lastSeen: new Date(),
        },
      };
    case "STATE":
      return {
        ...state,
        robotStatus: {
          ...state.robotStatus,
          ...(action.payload.state && { state: action.payload.state }),
          ...(action.payload.mood && { mood: action.payload.mood }),
          ...(action.payload.mode && { mode: action.payload.mode }),
          lastSeen: new Date(),
        },
      };
    case "SYSTEM":
      return {
        ...state,
        robotStatus: {
          ...state.robotStatus,
          metrics: action.payload,
          uptime: action.payload.uptime ?? state.robotStatus.uptime,
          lastSeen: new Date(),
        },
      };
    case "LOG":
      return {
        ...state,
        logs: [action.payload, ...state.logs].slice(0, 200),
      };
    case "CAMERA":
      return {
        ...state,
        cameraFrame: action.payload.base64,
        cameraSize: { width: action.payload.width, height: action.payload.height },
        robotStatus: {
          ...state.robotStatus,
          cameraFps: state.robotStatus.cameraFps,
          lastSeen: new Date(),
        },
      };
    case "AI_RESPONSE":
      return {
        ...state,
        typing: false,
        lastAiResponse: {
          id: Date.now(),
          text: action.payload.text,
          spokenOnRobot: action.payload.spokenOnRobot ?? false,
        },
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: action.payload.text,
            timestamp: new Date(),
            provider: action.payload.provider as Message["provider"],
            model: action.payload.model,
          },
        ],
      };
    case "SPEECH":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: "user", content: action.payload.text, timestamp: new Date() },
        ],
      };
    case "SPEECH_RECOGNIZED":
      return {
        ...state,
        lastSpeechRecognized: {
          id: Date.now(),
          text: action.payload.text,
          route: action.payload.route,
        },
        ...(action.payload.route === "local"
          ? {
              messages: [
                ...state.messages,
                {
                  role: "user" as const,
                  content: action.payload.text,
                  timestamp: new Date(),
                },
              ],
            }
          : {}),
      };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "SET_TYPING":
      return { ...state, typing: action.payload };
    case "SET_LATENCY":
      return { ...state, latency: action.payload };
    default:
      return state;
  }
}

export function useWebSocket() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const pingTime = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}?role=browser`);
    wsRef.current = ws;

    ws.onopen = () => {
      dispatch({ type: "CONNECTED" });
      reconnectDelay.current = 1000;
    };

    ws.onclose = () => {
      dispatch({ type: "DISCONNECTED" });
      wsRef.current = null;
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        /* ignore parse errors */
      }
    };
  }, []);

  const handleMessage = (msg: WsMessage) => {
    switch (msg.type) {
      case "STATUS":
        dispatch({
          type: "UPDATE_STATUS",
          payload: { ...(msg.payload as Partial<RobotStatus>), connected: true },
        });
        break;
      case "ROBOT_CONNECTED":
        dispatch({ type: "UPDATE_STATUS", payload: { connected: true } });
        break;
      case "ROBOT_DISCONNECTED":
        dispatch({ type: "UPDATE_STATUS", payload: { connected: false } });
        break;
      case "SENSORS": {
        const parsed = parseSensorsPayload(msg.payload as Record<string, unknown>);
        dispatch({ type: "SENSORS", payload: parsed });
        break;
      }
      case "DETECTED_OBJECTS":
        dispatch({
          type: "OBJECTS",
          payload: (msg.payload.objects as DetectedObject[]) || [],
        });
        break;
      case "STATE":
        dispatch({
          type: "STATE",
          payload: msg.payload as { state?: RobotState; mood?: Mood; mode?: RobotMode },
        });
        break;
      case "SYSTEM":
        dispatch({
          type: "SYSTEM",
          payload: msg.payload as unknown as SystemMetrics & { uptime?: number },
        });
        break;
      case "LOG":
        dispatch({
          type: "LOG",
          payload: {
            level: (msg.payload.level as LogEntry["level"]) || "info",
            message: String(msg.payload.message || ""),
            module: String(msg.payload.module || "robot"),
            timestamp: new Date(),
          },
        });
        break;
      case "CAMERA_FRAME":
        dispatch({
          type: "CAMERA",
          payload: {
            base64: String(msg.payload.base64 || ""),
            width: Number(msg.payload.width) || 640,
            height: Number(msg.payload.height) || 480,
          },
        });
        break;
      case "AI_RESPONSE":
        dispatch({
          type: "AI_RESPONSE",
          payload: {
            text: String(msg.payload.text || ""),
            model: msg.payload.model ? String(msg.payload.model) : undefined,
            provider: msg.payload.provider ? String(msg.payload.provider) : undefined,
            spokenOnRobot: Boolean(msg.payload.spoken_on_robot),
          },
        });
        break;
      case "SPEECH_RECOGNIZED":
        dispatch({
          type: "SPEECH_RECOGNIZED",
          payload: {
            text: String(msg.payload.text || ""),
            route: String(msg.payload.route || "dashboard"),
          },
        });
        break;
      case "HEARTBEAT":
        if (pingTime.current) {
          dispatch({ type: "SET_LATENCY", payload: Date.now() - pingTime.current });
        }
        break;
    }
  };

  const sendCommand = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
      return true;
    }
    fetch("/api/robot/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    }).catch(() => {});
    return false;
  }, []);

  useEffect(() => {
    connect();
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        pingTime.current = Date.now();
        wsRef.current.send(JSON.stringify({ type: "PING", payload: {}, timestamp: Date.now() }));
      }
    }, 10000);

    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(pingInterval);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    ...state,
    sendCommand,
    dispatch,
  };
}
