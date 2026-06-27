// Typed front door to the AI agent wasm harness. Everything the UI touches in
// the wasm module goes through here so initialization happens exactly once and
// the JS-side types stay in one place.

import init, {
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
  /** Provider id: 'anthropic' (default) or 'deepseek'. Routes to the matching
   *  LlmProvider impl in wasm. */
  provider?: string
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
