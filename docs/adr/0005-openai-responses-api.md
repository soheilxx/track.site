# ADR-0005 - OpenAI Responses API with strict function calling and structured outputs

Date: 2026-09-02. Status: accepted.

## Context
The assistant must use the OpenAI API via the Responses API (not Assistants, not Chat Completions) with strict function calling, structured outputs, streaming and server-side tool orchestration; models are selected via environment variables.

## Decision
- Official `openai` Node SDK 7.x; `client.responses.create({ stream: true, store: false, ... })`.
- Tools: `type: "function"`, `strict: true`, all properties required, nullable via type arrays, `additionalProperties: false`; schemas generated from Zod and re-validated server-side.
- Final UI answer via `text.format = { type: "json_schema", strict: true }` with the versioned `AssistantUiResponse` schema.
- `parallel_tool_calls: false` whenever write tools are exposed; read-only turns may parallelise.
- Conversation state is app-owned (encrypted transcript + structured summary); `previous_response_id` and Conversations are not used. Developer instructions are resent on every request.
- Models verified on 2026-09-02 against https://developers.openai.com/api/docs/models: `gpt-5.6-terra` (primary), `gpt-5.6-luna` (fast), `gpt-5.6-sol` (complex), configured via `AI_MODEL_PRIMARY`, `AI_MODEL_FAST`, `AI_MODEL_COMPLEX`; never hard-coded in the UI.
- `safety_identifier` = HMAC of the tenant id; `prompt_cache_key` = tenant + tool-set version.

## Consequences
Provider outages degrade to the rule-based wizard; write tools are never retried implicitly; token, latency and cost metrics per tenant.
