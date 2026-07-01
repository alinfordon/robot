"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRobot } from "@/app/hooks/useRobot";
import { useSpeech } from "@/app/hooks/useSpeech";
import { useAudioSettings } from "@/app/hooks/useAudioSettings";
import { Provider, Message, OllamaModelMode } from "@/app/types/robot";
import StatusBar from "@/app/components/StatusBar";
import RobotFace from "@/app/components/RobotFace";
import CameraFeed from "@/app/components/CameraFeed";
import PersonEnrollPanel from "@/app/components/PersonEnrollPanel";
import MemoryPanel from "@/app/components/MemoryPanel";
import SensorPanel from "@/app/components/SensorPanel";
import EncoderPanel from "@/app/components/EncoderPanel";
import RobotMap from "@/app/components/RobotMap";
import ChatArea from "@/app/components/ChatArea";
import MotorControl from "@/app/components/MotorControl";
import LogPanel from "@/app/components/LogPanel";
import BilingualTranslator from "@/app/components/BilingualTranslator";
import { useSpeechRecognition } from "@/app/hooks/useSpeechRecognition";

const DESKTOP_TABS = [
  { id: "monitor", label: "Monitor" },
  { id: "memory", label: "Memorie" },
  { id: "translator", label: "Traducător" },
  { id: "control", label: "Control motoare" },
  { id: "logs", label: "Log" },
] as const;

const MOBILE_TABS = [
  { id: "monitor", label: "Monitor" },
  { id: "memory", label: "Memorie" },
  { id: "translator", label: "Traducător" },
  { id: "chat", label: "Chat" },
  { id: "control", label: "Control" },
  { id: "logs", label: "Log" },
] as const;

type DesktopTab = (typeof DESKTOP_TABS)[number]["id"];
type MobileTab = (typeof MOBILE_TABS)[number]["id"];

export default function DashboardClient() {
  const robot = useRobot();
  const { speak: browserSpeak, isSpeaking: browserSpeaking } = useSpeech();
  const { settings, updateSettings } = useAudioSettings();
  const [desktopTab, setDesktopTab] = useState<DesktopTab>("monitor");
  const [mobileTab, setMobileTab] = useState<MobileTab>("monitor");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [provider, setProvider] = useState<Provider>("ollama");
  const [ollamaMode, setOllamaMode] = useState<OllamaModelMode>("auto");
  const lastSpokenAiId = useRef<number | null>(null);
  const lastHandledSpeechId = useRef<number | null>(null);
  const handleSendRef = useRef<(text: string, provider: Provider) => Promise<void>>(async () => {});

  const allMessages = [...robot.messages, ...localMessages];

  const speechRecognition = useSpeechRecognition("ro-RO");
  const onTranslatorTab = desktopTab === "translator" || mobileTab === "translator";

  useEffect(() => {
    if (!robot.robotStatus.connected || onTranslatorTab) return;
    const useRobotMic = settings.microphoneSource === "robot";
    robot.sendCommand("SET_STT_CONFIG", {
      enabled: useRobotMic,
      route: "dashboard",
    });
  }, [settings.microphoneSource, robot.robotStatus.connected, robot.sendCommand, onTranslatorTab]);

  useEffect(() => {
    speechRecognition.deactivate();
  }, [settings.microphoneSource, speechRecognition.deactivate]);

  const robotSpeaking = robot.robotStatus.state === "speaking";
  const isOutputActive = robotSpeaking || browserSpeaking;

  useEffect(() => {
    if (settings.microphoneSource !== "pc") return;
    if (isOutputActive) {
      speechRecognition.pauseForTts();
    } else {
      speechRecognition.resumeAfterTts();
    }
  }, [
    isOutputActive,
    settings.microphoneSource,
    speechRecognition.pauseForTts,
    speechRecognition.resumeAfterTts,
  ]);

  useEffect(() => {
    const ai = robot.lastAiResponse;
    if (!ai || ai.id === lastSpokenAiId.current) return;
    lastSpokenAiId.current = ai.id;

    if (ai.spokenOnRobot || !settings.pcTtsEnabled) return;
    void browserSpeak(ai.text);
  }, [robot.lastAiResponse, settings.pcTtsEnabled, browserSpeak]);

  const handleSend = useCallback(
    async (text: string, provider: Provider) => {
      const pcMicActive =
        settings.microphoneSource === "pc" && speechRecognition.isVoiceActive;
      if (pcMicActive) {
        speechRecognition.pauseForTts();
      }

      const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
      setLocalMessages((prev) => [...prev, userMsg]);
      robot.dispatch({ type: "SET_TYPING", payload: true });

      const speakOnRobot = settings.robotTtsOnChat && robot.robotStatus.connected;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...allMessages, userMsg].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            provider,
            robotContext: {
              sensors: robot.robotStatus.sensors,
              objects: robot.robotStatus.objects,
              state: robot.robotStatus.state,
              mode: robot.robotStatus.mode,
            },
            speak: speakOnRobot,
            ollamaMode: provider === "ollama" ? ollamaMode : undefined,
          }),
        });
        const data = await res.json();
        const reply = data.reply || data.error || "Eroare.";
        setLocalMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: reply,
            timestamp: new Date(),
            provider: data.provider,
            model: data.model,
          },
        ]);

        if (settings.pcTtsEnabled && !speakOnRobot) {
          await browserSpeak(reply);
        }
      } catch {
        setLocalMessages((prev) => [
          ...prev,
          { role: "system", content: "Eroare de conexiune la AI.", timestamp: new Date() },
        ]);
      } finally {
        robot.dispatch({ type: "SET_TYPING", payload: false });
      }
    },
    [allMessages, robot, browserSpeak, settings.pcTtsEnabled, settings.robotTtsOnChat, settings.microphoneSource, speechRecognition, provider, ollamaMode]
  );

  handleSendRef.current = handleSend;

  useEffect(() => {
    if (settings.microphoneSource !== "robot") return;
    if (!speechRecognition.isVoiceActive) return;
    if (robot.robotStatus.state === "speaking") return;
    const speech = robot.lastSpeechRecognized;
    if (!speech || speech.id === lastHandledSpeechId.current) return;
    if (speech.route !== "dashboard") return;
    lastHandledSpeechId.current = speech.id;
    if (speech.text.trim()) {
      handleSendRef.current(speech.text.trim(), provider);
    }
  }, [
    robot.lastSpeechRecognized,
    settings.microphoneSource,
    provider,
    speechRecognition.isVoiceActive,
    robot.robotStatus.state,
  ]);

  useEffect(() => {
    speechRecognition.setOnChatMessage((text) => {
      if (settings.microphoneSource === "pc" && text.trim()) {
        handleSendRef.current(text.trim(), provider);
      }
    });
  }, [speechRecognition.setOnChatMessage, settings.microphoneSource, provider]);

  const chatPanel = (
    <ChatArea
      messages={allMessages}
      typing={robot.typing}
      robotStatus={robot.robotStatus}
      audioSettings={settings}
      onAudioSettingsChange={updateSettings}
      provider={provider}
      onProviderChange={setProvider}
      ollamaMode={ollamaMode}
      onOllamaModeChange={setOllamaMode}
      voiceInput={{
        microphoneSource: settings.microphoneSource,
        isVoiceActive: speechRecognition.isVoiceActive,
        isListening: speechRecognition.isListening,
        isPausedForTts: speechRecognition.isPausedForTts,
        interimText: speechRecognition.interimText,
        micError: speechRecognition.micError,
        pcMicSupported: speechRecognition.isSupported,
        onTogglePcMic: speechRecognition.toggleVoiceActive,
        onToggleRobotMic: speechRecognition.toggleRobotVoiceGate,
      }}
      onSend={handleSend}
    />
  );

  return (
    <div className="dashboard-root">
      <StatusBar wsConnected={robot.connected} robotStatus={robot.robotStatus} latency={robot.latency} />

      {/* Desktop */}
      <main className="dashboard-main desktop-layout">
        <section className="dashboard-left">
          <nav className="dashboard-tabs">
            {DESKTOP_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`btn ${desktopTab === tab.id ? "btn-active" : ""}`}
                onClick={() => setDesktopTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="dashboard-tab-content scroll-y">
            {desktopTab === "monitor" && (
              <div className="monitor-grid">
                <div className="monitor-face">
                  <RobotFace mood={robot.robotStatus.mood} onClick={() => robot.speak("Salut!")} />
                  <div className="robot-meta">
                    Stare: <span>{robot.robotStatus.state}</span>
                    {" · "}
                    Mod: <span>{robot.robotStatus.mode}</span>
                  </div>
                </div>
                <div className="monitor-camera">
                  <CameraFeed
                    frame={robot.cameraFrame}
                    objects={robot.robotStatus.objects}
                    width={robot.cameraSize.width}
                    height={robot.cameraSize.height}
                    fps={robot.robotStatus.cameraFps}
                  />
                  <PersonEnrollPanel frame={robot.cameraFrame} objects={robot.robotStatus.objects} />
                </div>
                <div className="monitor-sensors">
                  <SensorPanel
                    sensors={robot.robotStatus.sensors}
                    meta={robot.robotStatus.sensorMeta}
                    connected={robot.robotStatus.connected}
                  />
                  <RobotMap sensors={robot.robotStatus.sensors} meta={robot.robotStatus.sensorMeta} />
                  <EncoderPanel
                    encoders={robot.robotStatus.encoders}
                    meta={robot.robotStatus.encoderMeta}
                    connected={robot.robotStatus.connected}
                  />
                </div>
              </div>
            )}

            {desktopTab === "memory" && <MemoryPanel />}

            {desktopTab === "translator" && (
              <BilingualTranslator
                robotConnected={robot.robotStatus.connected}
                robotSpeaking={robot.robotStatus.state === "speaking"}
                lastSpeechRecognized={robot.lastSpeechRecognized}
                sendCommand={robot.sendCommand}
                robotSpeak={robot.speak}
                audioSettings={settings}
                onAudioSettingsChange={updateSettings}
              />
            )}

            {desktopTab === "control" && (
              <div className="control-tab">
                <MotorControl
                  mode={robot.robotStatus.mode}
                  onMove={robot.move}
                  onSetMode={robot.setMode}
                />
              </div>
            )}

            {desktopTab === "logs" && <LogPanel logs={robot.logs} />}
          </div>
        </section>

        <aside className="dashboard-chat">{chatPanel}</aside>
      </main>

      {/* Mobile */}
      <nav className="mobile-tabs">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`btn ${mobileTab === tab.id ? "btn-active" : ""}`}
            onClick={() => setMobileTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="dashboard-main mobile-layout scroll-y">
        {mobileTab === "monitor" && (
          <>
            <RobotFace mood={robot.robotStatus.mood} onClick={() => robot.speak("Salut!")} />
            <div style={{ marginTop: 12 }}>
              <CameraFeed
                frame={robot.cameraFrame}
                objects={robot.robotStatus.objects}
                width={robot.cameraSize.width}
                height={robot.cameraSize.height}
                fps={robot.robotStatus.cameraFps}
              />
              <PersonEnrollPanel frame={robot.cameraFrame} objects={robot.robotStatus.objects} />
            </div>
            <div style={{ marginTop: 12 }}>
              <SensorPanel
                sensors={robot.robotStatus.sensors}
                meta={robot.robotStatus.sensorMeta}
                connected={robot.robotStatus.connected}
              />
              <RobotMap sensors={robot.robotStatus.sensors} meta={robot.robotStatus.sensorMeta} />
              <EncoderPanel
                encoders={robot.robotStatus.encoders}
                meta={robot.robotStatus.encoderMeta}
                connected={robot.robotStatus.connected}
              />
            </div>
          </>
        )}
        {mobileTab === "memory" && <MemoryPanel />}
        {mobileTab === "translator" && (
          <BilingualTranslator
            robotConnected={robot.robotStatus.connected}
            robotSpeaking={robot.robotStatus.state === "speaking"}
            lastSpeechRecognized={robot.lastSpeechRecognized}
            sendCommand={robot.sendCommand}
            robotSpeak={robot.speak}
            audioSettings={settings}
            onAudioSettingsChange={updateSettings}
          />
        )}
        {mobileTab === "chat" && chatPanel}
        {mobileTab === "control" && (
          <MotorControl mode={robot.robotStatus.mode} onMove={robot.move} onSetMode={robot.setMode} />
        )}
        {mobileTab === "logs" && <LogPanel logs={robot.logs} />}
      </main>
    </div>
  );
}
