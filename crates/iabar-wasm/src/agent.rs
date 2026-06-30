//! Agent-loop bridge — drives the real `iacoder-agent` runtime inside the
//! browser on wasm.
//!
//! This is the Wave D payoff of ADR-0103/0104: the engine's whole agent loop
//! (`iacoder-agent`), its tool layer (`iacoder-tools`) and its context /
//! compaction layer (`iacoder-context`) now cross the wasm gate, driven by a
//! host-injected provider + tools (shell / keyring / rig / hook-exec are absent
//! by `cfg`). The bridge:
//!   1. builds a host provider (the same `LlmProvider` impls `provider_chat`
//!      uses — every byte still flows through one audited fetch seam);
//!   2. assembles a `Runtime` via `AgentBuilder` with a browser-safe tool set
//!      (`ThinkTool`) + an `AllowAll` gate + a sized context pipeline;
//!   3. drives ONE user turn, pumping `AgentEvent`s (incl. PreCompact /
//!      PostCompact) to a JS callback as they arrive, and returns the final
//!      `RunResult` projection.
//!
//! Compaction here is the drop-oldest pipeline (`.context_window`): it emits the
//! PreCompact/PostCompact observability the shell needs without any extra LLM
//! egress. LLM-summarizing compaction (`.flash`) rides the *same* injected
//! provider and can be enabled later behind a flag — see docs/decisions/0010.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use iacoder_agent::{AgentBuilder, AgentEvent, AllowAll, RunRequest};
use iacoder_core::{BoxedTool, Content, LlmProvider, Message, Role};

/// One prior turn in the conversation the agent should see as history.
#[derive(Deserialize)]
struct Turn {
    role: String,
    content: String,
}

/// JS request shape for {@link agent_run}. camelCase to match the JS caller.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentRequest {
    api_key: String,
    /// Provider id: `anthropic` routes to the Anthropic wire format; any other
    /// id (e.g. `deepseek`) uses the generic OpenAI-compatible provider.
    #[serde(default)]
    provider: Option<String>,
    /// OpenAI-compatible base URL for non-Anthropic providers.
    #[serde(default)]
    base_url: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    system: Option<String>,
    /// Prior conversation turns (excludes the new prompt below).
    #[serde(default)]
    history: Vec<Turn>,
    /// The new user message that opens this run.
    user_prompt: String,
    #[serde(default)]
    max_turns: Option<usize>,
    /// Compaction window in tokens; the pipeline compacts at ~60% of this.
    #[serde(default)]
    context_window: Option<u32>,
}

/// Final projection returned to JS when the run settles. The streamed events
/// carry the live surface; this is the at-rest result.
#[derive(Serialize)]
struct AgentResult {
    text: String,
    stop_reason: String,
    turns: usize,
    input_tokens: u32,
    output_tokens: u32,
    /// Provider's `Date` response header from the run's last provider call
    /// (RFC 1123), for the trusted-time watermark — same sample
    /// `provider_chat` surfaces. `None` if no call carried one.
    server_date: Option<String>,
}

/// Build the host `LlmProvider` for the run — the same impls `provider_chat`
/// routes through, so the agent loop's every call (chat + compaction) exits via
/// one audited fetch seam.
fn build_provider(req: &AgentRequest) -> Arc<dyn LlmProvider> {
    match req.provider.as_deref() {
        Some("anthropic") | None => {
            Arc::new(crate::provider::AnthropicProvider::new(
                req.api_key.clone(),
                req.model.clone(),
            ))
        }
        _ => Arc::new(crate::openai_compat::OpenAiCompatProvider::new(
            req.base_url.clone(),
            req.api_key.clone(),
            req.model.clone(),
        )),
    }
}

/// Flatten prior JS turns into engine `Message`s (text-only; tool calls and
/// multimodal arrive with later waves, matching `provider_chat`).
fn to_messages(turns: &[Turn]) -> Vec<Message> {
    turns
        .iter()
        .map(|t| Message {
            role: if t.role == "assistant" {
                Role::Assistant
            } else {
                Role::User
            },
            content: vec![Content::Text {
                text: Arc::from(t.content.as_str()),
            }],
            tool_calls: Vec::new(),
        })
        .collect()
}

/// Project an `AgentEvent` into a small `{type, ...}` JSON object for JS. Only
/// scalar-field variants are mapped explicitly; everything else is forwarded as
/// `{type:"other", debug}` so no observability is silently swallowed (Article I)
/// while keeping the bridge decoupled from the engine's richer payload types.
fn event_to_js(ev: &AgentEvent) -> Option<JsValue> {
    use serde_json::json;
    let v = match ev {
        AgentEvent::UserPromptSubmit { text } => json!({"type":"user_prompt","text":text}),
        AgentEvent::AssistantTextDelta(t) => json!({"type":"assistant_delta","text":t}),
        AgentEvent::ReasoningDelta(t) => json!({"type":"reasoning_delta","text":t}),
        AgentEvent::PreCompact { before_messages } => {
            json!({"type":"pre_compact","beforeMessages":before_messages})
        }
        AgentEvent::PostCompact {
            after_messages,
            dropped_messages,
        } => json!({
            "type":"post_compact",
            "afterMessages":after_messages,
            "droppedMessages":dropped_messages,
        }),
        AgentEvent::ForceCompactRequested { reason } => {
            json!({"type":"force_compact","reason":reason})
        }
        AgentEvent::CompactDeltaAttached { sources } => {
            json!({"type":"compact_delta","sources":sources})
        }
        AgentEvent::PermissionRequest { id, tool } => {
            json!({"type":"permission_request","id":id,"tool":tool})
        }
        AgentEvent::PermissionDenied { id, tool, reason } => {
            json!({"type":"permission_denied","id":id,"tool":tool,"reason":reason})
        }
        AgentEvent::ToolCallStart { id, name } => {
            json!({"type":"tool_call_start","id":id,"name":name})
        }
        AgentEvent::ToolCallArgsDelta { id, delta } => {
            json!({"type":"tool_call_args","id":id,"delta":delta})
        }
        AgentEvent::ToolCallResult {
            id,
            name,
            is_error,
            output,
        } => json!({
            "type":"tool_call_result",
            "id":id,"name":name,"isError":is_error,"output":output,
        }),
        other => json!({"type":"other","debug": format!("{other:?}")}),
    };
    serde_wasm_bindgen::to_value(&v).ok()
}

/// Drive one user turn through the real `iacoder-agent` loop on wasm.
///
/// `on_event` is invoked once per streamed [`AgentEvent`] with a small JSON
/// object (see {@link event_to_js}); the returned promise resolves to the final
/// {@link AgentResult}. The event pump runs cooperatively on the same thread, so
/// deltas reach JS as the loop yields on each provider fetch.
#[wasm_bindgen]
pub async fn agent_run(req: JsValue, on_event: js_sys::Function) -> Result<JsValue, JsValue> {
    let req: AgentRequest = serde_wasm_bindgen::from_value(req)
        .map_err(|e| JsValue::from_str(&format!("bad request: {e}")))?;

    let provider = build_provider(&req);
    let model = req.model.clone().unwrap_or_default();

    // Browser-safe tool set: the portable in-process `ThinkTool`. Native tools
    // (shell/fs/edit) are `cfg`'d out of `iacoder-tools` on wasm; host-backed
    // browser tools (page read, etc.) attach via seams in a later wave.
    let tools: Vec<BoxedTool> = vec![Arc::new(iacoder_tools::ThinkTool)];
    let permissions = Arc::new(AllowAll);
    let max_turns = req.max_turns.unwrap_or(8);
    let window = req.context_window.unwrap_or(128_000);

    let runtime = AgentBuilder::new(provider, tools, permissions, max_turns)
        .context_window(window)
        .build();

    let prior = to_messages(&req.history);
    let run_req = RunRequest {
        model,
        system: req.system.clone(),
        user_prompt: req.user_prompt.clone(),
        prior_history: (!prior.is_empty()).then(|| Arc::new(prior)),
        ..Default::default()
    };

    // Pump events to JS on the same single thread, interleaved with `run()`.
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AgentEvent>();
    wasm_bindgen_futures::spawn_local(async move {
        while let Some(ev) = rx.recv().await {
            if let Some(val) = event_to_js(&ev) {
                let _ = on_event.call1(&JsValue::NULL, &val);
            }
        }
    });

    // `run` owns `tx`; when this await returns the run future drops, closing the
    // channel so the pump above drains its tail and ends.
    let result = runtime
        .run(run_req, Some(tx))
        .await
        .map_err(|e| JsValue::from_str(&format!("agent run: {e:?}")))?;

    let total = result.usage.total_usage();
    let out = AgentResult {
        text: result.assistant_text,
        stop_reason: format!("{:?}", result.stop_reason),
        turns: result.turns,
        input_tokens: total.input_tokens,
        output_tokens: total.output_tokens,
        // The providers (`AnthropicProvider` / `OpenAiCompatProvider`) stamp the
        // server `Date` on every call; take the freshest sample from the run.
        server_date: crate::server_time::take(),
    };
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&format!("encode: {e}")))
}
