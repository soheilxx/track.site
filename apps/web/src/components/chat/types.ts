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
  summary: { changes: Array<{ summary: string; op: "add" | "remove" | "change" }>; recipients: Array<{ name: string; type: string; purpose: string; events: string[] }> };
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

/** One activity sentence bound to a real tool run / job (latest phase per run id). */
export interface ActivityView {
  runId: string;
  activity: string;
  sentence: string;
  phase: "started" | "completed" | "blocked" | "failed";
  params: { missing?: string[]; reason?: string };
  at: number;
}

export interface ChatError {
  code: string;
  message: string;
  retryable: boolean;
}

/** `sending` = request in flight before the first frame; `working`/`streaming` from real events; `reconnecting` = resuming the same turn. */
export type ChatStatus = "idle" | "sending" | "working" | "streaming" | "reconnecting";

export interface SseFrame {
  /** the `id:` line (event sequence number) when present */
  id: number | null;
  event: string | null;
  data: unknown;
}

/** Parses an SSE stream from fetch into frames (id + event name + JSON data); malformed frames are skipped. */
export async function readSse(res: Response, onFrame: (frame: SseFrame) => void): Promise<void> {
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
      const lines = raw.split("\n");
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const idLine = lines.find((l) => l.startsWith("id: "));
      const eventLine = lines.find((l) => l.startsWith("event: "));
      const id = idLine ? Number(idLine.slice(4)) : NaN;
      try {
        onFrame({ id: Number.isInteger(id) ? id : null, event: eventLine ? eventLine.slice(7) : null, data: JSON.parse(dataLine.slice(6)) as unknown });
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
