"use client";

import { useWebSocket } from "./useWebSocket";
import { Provider, RobotStatus } from "@/app/types/robot";

export function useRobot() {
  const ws = useWebSocket();

  const move = (direction: string, speed: number) => {
    ws.sendCommand("MOVE", { direction, speed });
  };

  const speak = (text: string, lang: "ro" | "en" = "ro") => {
    ws.sendCommand("SPEAK", { text, lang });
  };

  const setMode = (mode: RobotStatus["mode"]) => {
    ws.sendCommand("SET_MODE", { mode });
  };

  const setSpeed = (left: number, right: number) => {
    ws.sendCommand("SET_SPEED", { left, right });
  };

  const sendIR = (code: string) => {
    ws.sendCommand("IR_SEND", { code });
  };

  const reset = () => {
    ws.sendCommand("RESET", {});
  };

  return {
    connected: ws.connected,
    robotStatus: ws.robotStatus,
    logs: ws.logs,
    messages: ws.messages,
    cameraFrame: ws.cameraFrame,
    cameraSize: ws.cameraSize,
    latency: ws.latency,
    typing: ws.typing,
    lastAiResponse: ws.lastAiResponse,
    lastSpeechRecognized: ws.lastSpeechRecognized,
    move,
    speak,
    setMode,
    setSpeed,
    sendIR,
    reset,
    sendCommand: ws.sendCommand,
    dispatch: ws.dispatch,
  };
}

export type UseRobotReturn = ReturnType<typeof useRobot>;
