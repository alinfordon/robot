export type VoiceParseResult = {
  action: "wake" | "sleep" | "chat" | "ignore";
  message: string;
};

const WAKE_RE = /\b(hey|hei)\s*,?\s*ody\b/i;
const SLEEP_RE = /\b(by|bye|bai)\s*,?\s*ody\b/i;

function stripPhrase(text: string, re: RegExp): string {
  return text.replace(re, " ").replace(/\s+/g, " ").trim();
}

/** Parse STT transcript for Hey Ody / By Ody voice control. */
export function parseVoiceTranscript(
  text: string,
  isVoiceActive: boolean
): VoiceParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { action: "ignore", message: "" };

  if (SLEEP_RE.test(trimmed)) {
    return { action: "sleep", message: "" };
  }

  if (WAKE_RE.test(trimmed)) {
    const message = stripPhrase(trimmed, WAKE_RE);
    return { action: "wake", message };
  }

  if (isVoiceActive) {
    return { action: "chat", message: trimmed };
  }

  return { action: "ignore", message: "" };
}
