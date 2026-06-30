// Typed front door to the AI agent wasm harness. Everything the UI touches in
// the wasm module goes through here so initialization happens exactly once and
// the JS-side types stay in one place.

import init, {
  agent_run,
  anthropic_chat,
  hook_events,
  is_valid_event,
  provider_chat,
  validate_hooks,
  version,
} from '../wasm/iabar_wasm.js'

/** One validated `[[hooks]]` entry, mirrors the Rust `HookSummary`. */
export interface HookSummary {
  event: string
  kind: 'command' | 'prompt' | 'http'
  detail: string
  has_condition: boolean
  timeout_secs: number
}

/** Result of `validateHooks`, mirrors the Rust `ValidateResult`. */
export interface ValidateResult {
  ok: boolean
  count: number
  hooks: HookSummary[]
  error: string | null
}

let ready: Promise<void> | null = null

/** Initialize the wasm module once. The Rust `#[wasm_bindgen(start)]` hook
 *  installs the panic forwarder automatically during this call. */
export function initHarness(): Promise<void> {
  if (!ready) {
    ready = init().then(() => undefined)
  }
  return ready
}

/** AI agent hook-system version (the wasm crate version). */
export function harnessVersion(): string {
  return version()
}

/** All lifecycle events the engine recognizes, straight from the harness. */
export function hookEvents(): string[] {
  return hook_events()
}

/** Whether `name` is a hook event the engine recognizes. */
export function isValidEvent(name: string): boolean {
  return is_valid_event(name)
}

/** Parse + validate a `[[hooks]]` TOML document with real engine code. */
export function validateHooks(tomlSrc: string): ValidateResult {
  return validate_hooks(tomlSrc) as ValidateResult
}

/** A single chat turn, matching the wasm `ChatMessage`. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Result of an Anthropic chat call, matching the wasm `ChatResult`. */
export interface ChatResult {
  text: string
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
}

/** Request shape for {@link anthropicChat} / {@link providerChat}. */
export interface ChatRequest {
  apiKey: string
  /** Provider id: 'anthropic' (default) routes to the Anthropic impl; any other
   *  id routes to the generic OpenAI-compatible impl in wasm. */
  provider?: string
  /** OpenAI-compatible base URL for non-Anthropic providers (e.g.
   *  `https://api.deepseek.com`). Ignored for the Anthropic route. */
  baseUrl?: string
  model?: string
  system?: string
  messages: ChatTurn[]
  maxTokens?: number
}

/** Call Claude's Messages API from the browser via the wasm fetch client. */
export function anthropicChat(req: ChatRequest): Promise<ChatResult> {
  return anthropic_chat(req) as Promise<ChatResult>
}

/** Result of {@link providerChat} — mirrors the Rust `DriverResult`. */
export interface ProviderResult {
  text: string
  input_tokens: number
  output_tokens: number
  stop_reason: string
  /** Provider's `Date` response header (RFC 1123), for the trusted-time
   *  watermark. Null if the provider omitted it. */
  server_date: string | null
}

/**
 * Drive a turn through the real engine `LlmProvider` trait
 * (`AnthropicProvider::chat` → `ChatStream`). Same request shape as
 * {@link anthropicChat}, but every byte flows through the harness trait —
 * the Wave B/C path.
 */
export function providerChat(req: ChatRequest): Promise<ProviderResult> {
  return provider_chat(req) as Promise<ProviderResult>
}

// --- Agent loop (ADR-0103/0104) — the real `iacoder-agent` runtime on wasm ---

/** Request shape for {@link agentRun}. `history` is the prior transcript;
 *  `userPrompt` is the new turn that opens the run. */
export interface AgentRequest {
  apiKey: string
  /** `anthropic` → Anthropic wire format; any other id → OpenAI-compatible. */
  provider?: string
  /** OpenAI-compatible base URL for non-Anthropic providers. */
  baseUrl?: string
  model?: string
  system?: string
  history?: ChatTurn[]
  userPrompt: string
  maxTurns?: number
  /** Compaction window in tokens; the pipeline compacts at ~60% of this. */
  contextWindow?: number
}

/** A streamed event from the agent loop. `type` discriminates the payload;
 *  unknown engine events arrive as `{ type: 'other', debug }` rather than being
 *  dropped, so no observability is silently lost. */
export type AgentEvent =
  | { type: 'user_prompt'; text: string }
  | { type: 'assistant_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'pre_compact'; beforeMessages: number }
  | { type: 'post_compact'; afterMessages: number; droppedMessages: number }
  | { type: 'force_compact'; reason: string }
  | { type: 'compact_delta'; sources: string[] }
  | { type: 'permission_request'; id: string; tool: string }
  | { type: 'permission_denied'; id: string; tool: string; reason: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_args'; id: string; delta: string }
  | { type: 'tool_call_result'; id: string; name: string; isError: boolean; output: string }
  | { type: 'other'; debug: string }

/** Final projection returned when an {@link agentRun} settles. */
export interface AgentResult {
  text: string
  stop_reason: string
  turns: number
  input_tokens: number
  output_tokens: number
  /** Provider's `Date` header from the run's last call, for trusted-time. */
  server_date: string | null
}

/**
 * Drive one user turn through the real engine agent loop (`iacoder-agent`) on
 * wasm — tool dispatch + context compaction included. `onEvent` fires once per
 * streamed {@link AgentEvent} (deltas, PreCompact/PostCompact, tool calls); the
 * promise resolves to the final {@link AgentResult}. Every provider call — chat
 * and compaction alike — exits through the one audited fetch seam.
 */
export function agentRun(
  req: AgentRequest,
  onEvent: (ev: AgentEvent) => void,
): Promise<AgentResult> {
  return agent_run(req, (ev: unknown) => onEvent(ev as AgentEvent)) as Promise<AgentResult>
}
