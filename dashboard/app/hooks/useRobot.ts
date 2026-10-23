"use client";

import { useWebSocket } from "./useWebSocket";
import { PanTiltDirection, Provider, RobotStatus } from "@/app/types/robot";

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
    if (mode === "manual") {
      ws.dispatch({ type: "AI_NAVIGATE", payload: { enabled: false } });
      fetch("/api/settings/ai-navigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }).catch(() => {});
    }
  };

  const setAiNavigate = async (enabled: boolean) => {
    ws.dispatch({ type: "AI_NAVIGATE", payload: { enabled } });
  };

  const setVolume = async (volume: number) => {
    ws.dispatch({ type: "VOLUME", payload: { volume } });
  };

  const setSpeed = (left: number, right: number) => {
    ws.sendCommand("SET_SPEED", { left, right });
  };

  const lookAt = (direction: PanTiltDirection, step?: number) => {
    ws.sendCommand("PANTILT", step === undefined ? { direction } : { direction, step });
  };

  const setPanTilt = (pan: number, tilt: number) => {
    ws.sendCommand("PANTILT", { pan, tilt });
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
    setAiNavigate,
    setVolume,
    setSpeed,
    lookAt,
    setPanTilt,
    sendIR,
    reset,
    sendCommand: ws.sendCommand,
    dispatch: ws.dispatch,
  };
}

export type UseRobotReturn = ReturnType<typeof useRobot>;
