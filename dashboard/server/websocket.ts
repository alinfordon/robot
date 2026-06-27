import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage, ServerResponse } from "http";
import {
  DEFAULT_METRICS,
  DEFAULT_ROBOT_STATUS,
  DEFAULT_SENSORS,
  DetectedObject,
  LogEntry,
  Mood,
  RobotMode,
  RobotState,
  RobotStatus,
  SensorData,
  SystemMetrics,
  WsMessage,
} from "../app/types/robot";
import { recordEvent, recordObservation, createTask, markTaskDone, markTaskSent, handleVisionEvents, shouldReactToPerson } from "../lib/memory/store";
import { getPeopleWithEncodings, handlePersonIdentification } from "../lib/people/store";
import { identifyPersonInFrame, isFaceRecognitionEnabled } from "../lib/vision/face";
import { isVisionOnPcEnabled, processCameraFrame } from "../lib/vision/processor";

const WS_PORT = parseInt(process.env.WS_PORT || "8080", 10);

type ClientRole = "robot" | "browser";

interface TaggedClient {
  ws: WebSocket;
  role: ClientRole;
}

class RobotBridge {
  private wss: WebSocketServer;
  private httpServer: ReturnType<typeof createServer>;
  private clients: Map<WebSocket, ClientRole> = new Map();
  private robotClient: WebSocket | null = null;
  private robotStatus: RobotStatus = { ...DEFAULT_ROBOT_STATUS };
  private logs: LogEntry[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private frameTimestamps: number[] = [];
  private lastObservationAt = 0;
  private lastObservationKey = "";

  constructor() {
    this.httpServer = createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (ws, req) => {
      const role = this.detectRole(req);
      this.clients.set(ws, role);

      if (role === "robot") {
        this.robotClient = ws;
        this.robotStatus.connected = true;
        this.robotStatus.lastSeen = new Date();
        this.broadcastToBrowsers({
          type: "ROBOT_CONNECTED",
          payload: {},
          timestamp: Date.now(),
        });
        console.log("[WS] Robot connected");
      } else {
        ws.send(
          JSON.stringify({
            type: "STATUS",
            payload: this.robotStatus,
            timestamp: Date.now(),
          })
        );
        console.log("[WS] Browser connected");
      }

      ws.on("message", (data) => this.handleMessage(ws, data));
      ws.on("close", () => this.handleDisconnect(ws, role));
      ws.on("error", (err) => console.error("[WS] Error:", err.message));
    });

    this.startHeartbeat();
    this.httpServer.listen(WS_PORT, () => {
      console.log(`[WS] Robot bridge on ws://localhost:${WS_PORT}`);
      console.log(`[HTTP] Status API on http://localhost:${WS_PORT}/robot/status`);
    });
  }

  private detectRole(req: IncomingMessage): ClientRole {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const role = url.searchParams.get("role");
    return role === "robot" ? "robot" : "browser";
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/robot/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.robotStatus));
      return;
    }

    if (req.url === "/robot/command" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { type, payload } = JSON.parse(body);
          const sent = this.sendToRobot(type, payload || {});
          res.writeHead(sent ? 200 : 503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: sent }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }

  private handleMessage(ws: WebSocket, data: WebSocket.RawData) {
    try {
      const msg: WsMessage = JSON.parse(data.toString());
      const role = this.clients.get(ws);

      if (role === "robot") {
        this.handleRobotMessage(msg);
        this.broadcastToBrowsers(msg);
      } else if (role === "browser") {
        this.sendToRobot(msg.type, msg.payload);
      }
    } catch (err) {
      console.error("[WS] Parse error:", err);
    }
  }

  private handleRobotMessage(msg: WsMessage) {
    this.robotStatus.lastSeen = new Date();

    switch (msg.type) {
      case "SENSORS":
        this.robotStatus.sensors = msg.payload as unknown as SensorData;
        if (this.isObstacleNear(this.robotStatus.sensors)) {
          this.robotStatus.mood = "alert";
        }
        break;
      case "DETECTED_OBJECTS":
        this.robotStatus.objects = (msg.payload.objects as DetectedObject[]) || [];
        break;
      case "STATE":
        if (msg.payload.state) this.robotStatus.state = msg.payload.state as RobotState;
        if (msg.payload.mood) this.robotStatus.mood = msg.payload.mood as Mood;
        if (msg.payload.mode) this.robotStatus.mode = msg.payload.mode as RobotMode;
        break;
      case "SYSTEM":
        this.robotStatus.metrics = msg.payload as unknown as SystemMetrics;
        if (typeof msg.payload.uptime === "number") {
          this.robotStatus.uptime = msg.payload.uptime as number;
        }
        break;
      case "CAMERA_FRAME":
        this.trackFps();
        this.processVisionOnPc(msg.payload.base64 as string);
        break;
      case "LOG":
        this.logs.unshift({
          level: (msg.payload.level as LogEntry["level"]) || "info",
          message: String(msg.payload.message || ""),
          module: String(msg.payload.module || "robot"),
          timestamp: new Date(),
        });
        if (this.logs.length > 200) this.logs.pop();
        break;
    }

    this.persistRobotMessage(msg);
  }

  private persistRobotMessage(msg: WsMessage) {
    void recordEvent(msg.type, msg.payload, "robot").catch((err) =>
      console.warn("[MongoDB] event write failed:", err)
    );

    const now = Date.now();
    const shouldSnapshot =
      msg.type === "DETECTED_OBJECTS" ||
      msg.type === "SENSORS" ||
      msg.type === "STATE";

    if (!shouldSnapshot) return;

    const objectKey = this.robotStatus.objects.map((o) => o.label).join(",");
    const snapshotKey = `${objectKey}|${this.robotStatus.state}|${this.robotStatus.mode}`;
    const objectChanged = snapshotKey !== this.lastObservationKey;
    const intervalElapsed = now - this.lastObservationAt > 5000;

    if (!objectChanged && !intervalElapsed) return;

    this.lastObservationAt = now;
    this.lastObservationKey = snapshotKey;

    void recordObservation({
      sensors: this.robotStatus.sensors,
      objects: this.robotStatus.objects,
      state: this.robotStatus.state,
      mode: this.robotStatus.mode,
      mood: this.robotStatus.mood,
    }).catch((err) => console.warn("[MongoDB] observation write failed:", err));
  }

  private processVisionOnPc(base64?: string) {
    if (!isVisionOnPcEnabled() || !base64) return;

    void processCameraFrame(base64)
      .then(async (result) => {
        if (!result || !result.objects.length) return;

        this.robotStatus.objects = result.objects;

        const detectionMsg: WsMessage = {
          type: "DETECTED_OBJECTS",
          payload: { objects: result.objects, source: "pc" },
          timestamp: Date.now(),
        };

        this.broadcastToBrowsers(detectionMsg);
        this.sendToRobot("DETECTED_OBJECTS", { objects: result.objects, source: "pc" }, { skipTask: true });

        await handleVisionEvents(result.events, result.objects);

        const personDetection = result.objects.find((o) => o.label === "person");
        const hasPersonEvent = result.events.some((e) => e.event === "person_detected");

        if (personDetection && hasPersonEvent && base64 && shouldReactToPerson()) {
          let greeting = "Bună! Te-am observat.";

          if (isFaceRecognitionEnabled()) {
            const known = await getPeopleWithEncodings();
            const faceResult = await identifyPersonInFrame(base64, personDetection, known);
            const identified = await handlePersonIdentification(faceResult);
            if (identified.greeting) greeting = identified.greeting;
          } else {
            await handlePersonIdentification({ faceFound: false, matched: false });
          }

          this.sendToRobot("SPEAK", { text: greeting });
        }

        void recordObservation({
          sensors: this.robotStatus.sensors,
          objects: result.objects,
          state: this.robotStatus.state,
          mode: this.robotStatus.mode,
          mood: this.robotStatus.mood,
        }).catch((err) => console.warn("[MongoDB] vision observation failed:", err));
      })
      .catch((err) => console.warn("[Vision] frame processing failed:", err));
  }

  private isObstacleNear(sensors: SensorData): boolean {
    return Object.values(sensors).some((d) => d > 0 && d < 20);
  }

  private trackFps() {
    const now = Date.now();
    this.frameTimestamps.push(now);
    this.frameTimestamps = this.frameTimestamps.filter((t) => now - t < 1000);
    this.robotStatus.cameraFps = this.frameTimestamps.length;
  }

  private handleDisconnect(ws: WebSocket, role: ClientRole) {
    this.clients.delete(ws);
    if (role === "robot" && this.robotClient === ws) {
      this.robotClient = null;
      this.robotStatus.connected = false;
      this.robotStatus.state = "idle";
      this.robotStatus.mood = "standby";
      this.broadcastToBrowsers({
        type: "ROBOT_DISCONNECTED",
        payload: {},
        timestamp: Date.now(),
      });
      console.log("[WS] Robot disconnected");
    }
  }

  sendToRobot(type: string, payload: Record<string, unknown>, opts?: { skipTask?: boolean }): boolean {
    if (!this.robotClient || this.robotClient.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Robot not connected, command dropped:", type);
      return false;
    }
    const msg: WsMessage = { type, payload, timestamp: Date.now() };
    this.robotClient.send(JSON.stringify(msg));

    void recordEvent(type, payload, "dashboard").catch((err) =>
      console.warn("[MongoDB] command event failed:", err)
    );

    if (!opts?.skipTask && process.env.MONGODB_SAVE_TASKS !== "0") {
      void createTask(type, type, payload)
        .then((taskId) => {
          if (taskId) {
            void markTaskSent(taskId);
            void markTaskDone(taskId);
          }
        })
        .catch((err) => console.warn("[MongoDB] task write failed:", err));
    }

    return true;
  }

  private broadcastToBrowsers(msg: WsMessage | { type: string; payload: unknown; timestamp: number }) {
    const data = JSON.stringify(msg);
    this.clients.forEach((role, ws) => {
      if (role === "browser" && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const heartbeat: WsMessage = {
        type: "HEARTBEAT",
        payload: { robotConnected: this.robotStatus.connected },
        timestamp: Date.now(),
      };
      this.broadcastToBrowsers(heartbeat);
      if (this.robotClient?.readyState === WebSocket.OPEN) {
        this.robotClient.send(JSON.stringify(heartbeat));
      }
    }, 5000);
  }

  getStatus(): RobotStatus {
    return this.robotStatus;
  }
}

const bridge = new RobotBridge();

export function getBridge(): RobotBridge {
  return bridge;
}

export { bridge };
