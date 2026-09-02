import type { AssistantUiResponse } from "@track-site/ai";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  ui: AssistantUiResponse | null;
  createdAt: string;
}

export interface PendingApprovalView {
  approvalId: string;
  action: string;
  summary: { changes?: Array<{ summary: string; op: string }> | unknown; recipients?: Array<{ name: string; type: string; purpose: string; events: string[] }> | unknown };
  expiresAt: string;
}

export interface CredentialRequestView {
  component: "oauth" | "secure_credential";
  integration_id: string;
  connector_type: string;
  credential_kind: string;
  label: string;
  help: string;
  oauth_provider: string | null;
}

export interface ToolActivity {
  callId: string;
  name: string;
  status: "running" | "ok" | "error";
  summary: string | null;
}

export type ChatStatus = "idle" | "thinking" | "tools" | "streaming" | "error";

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

/** Parses an SSE stream from fetch into events. */
export async function readSse(res: Response, onEvent: (e: SseEvent) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(6)) as SseEvent);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
