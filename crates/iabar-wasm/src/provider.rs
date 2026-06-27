//! `AnthropicProvider` — a real engine `LlmProvider` implemented over
//! the browser fetch backend.
//!
//! This is the payoff of the Wave B `Send` surgery: because the trait's `Send`
//! bounds are target-conditional, a `!Send` fetch-backed provider satisfies
//! `LlmProvider` on wasm. The harness's agent loop drives providers through
//! exactly this trait — so once the agent crate crosses the wasm gate (Wave D)
//! it will drive this provider unchanged.
//!
//! Streaming is not yet wired (reqwest's wasm backend returns whole bodies);
//! `chat` performs a non-streaming request and emits the result as a single
//! `TextDelta` + `Usage` + `Stop` (see IABar ROADMAP, Wave C).

use async_trait::async_trait;
use futures::stream;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use iacoder_core::{
    ChatRequest, ChatStream, Content, LlmProvider, ProviderCapabilities, ProviderError, Role,
    StopReason, StreamEvent, Usage,
};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
const DEFAULT_MODEL: &str = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS: u32 = 4096;

/// A fetch-backed Anthropic provider. Holds the leased key + default model.
#[derive(Debug)]
pub struct AnthropicProvider {
    api_key: String,
    model: String,
}

impl AnthropicProvider {
    pub fn new(api_key: impl Into<String>, model: Option<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
        }
    }
}

#[derive(Serialize)]
struct WireMsg {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct WireReq {
    model: String,
    max_tokens: u32,
    messages: Vec<WireMsg>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
}

#[derive(Deserialize)]
struct WireResp {
    #[serde(default)]
    content: Vec<WireBlock>,
    #[serde(default)]
    usage: Option<WireUsage>,
    #[serde(default)]
    error: Option<WireErr>,
}

#[derive(Deserialize)]
struct WireBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

#[derive(Deserialize, Default)]
struct WireUsage {
    #[serde(default)]
    input_tokens: u32,
    #[serde(default)]
    output_tokens: u32,
}

#[derive(Deserialize)]
struct WireErr {
    #[serde(default)]
    message: String,
}

/// Flatten an engine `Message` list into Anthropic wire messages, keeping only
/// text content (tool calls / multimodal arrive with Wave E).
fn to_wire(req: &ChatRequest) -> Vec<WireMsg> {
    req.messages
        .iter()
        .filter_map(|m| {
            let role = match m.role {
                Role::Assistant => "assistant",
                // System is carried separately; tool/user collapse to "user".
                _ => "user",
            };
            let text: String = m
                .content
                .iter()
                .filter_map(|c| match c {
                    Content::Text { text } => Some(text.to_string()),
                    _ => None,
                })
                .collect();
            (!text.is_empty()).then_some(WireMsg { role, content: text })
        })
        .collect()
}

#[async_trait(?Send)]
impl LlmProvider for AnthropicProvider {
    fn id(&self) -> &str {
        "anthropic"
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities::default()
    }

    async fn chat(&self, req: ChatRequest) -> Result<ChatStream, ProviderError> {
        let model = if req.model.is_empty() {
            self.model.clone()
        } else {
            req.model.clone()
        };
        let body = WireReq {
            model,
            max_tokens: DEFAULT_MAX_TOKENS,
            messages: to_wire(&req),
            system: req.system.clone(),
        };

        let resp = reqwest::Client::new()
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("anthropic-dangerous-direct-browser-access", "true")
            .json(&body)
            .send()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;

        let status = resp.status();
        let parsed: WireResp = resp
            .json()
            .await
            .map_err(|e| ProviderError::Provider(format!("decode ({status}): {e}")))?;

        if let Some(err) = parsed.error {
            // 401/403 → Auth so the runtime can surface a key problem distinctly.
            return Err(if status.as_u16() == 401 || status.as_u16() == 403 {
                ProviderError::Auth(err.message)
            } else {
                ProviderError::Provider(err.message)
            });
        }

        let text: String = parsed
            .content
            .iter()
            .filter(|b| b.kind == "text")
            .map(|b| b.text.as_str())
            .collect();
        let wu = parsed.usage.unwrap_or_default();
        let usage = Usage {
            input_tokens: wu.input_tokens,
            output_tokens: wu.output_tokens,
            ..Default::default()
        };

        let events = vec![
            Ok(StreamEvent::TextDelta(text)),
            Ok(StreamEvent::Usage(usage)),
            Ok(StreamEvent::Stop(StopReason::EndTurn)),
        ];
        Ok(Box::pin(stream::iter(events)))
    }
}

// --- JS driver: prove the path runs *through* the LlmProvider trait ---

use futures::StreamExt;

/// What `provider_chat` returns to JS.
#[derive(Serialize)]
struct DriverResult {
    text: String,
    input_tokens: u32,
    output_tokens: u32,
    stop_reason: String,
}

/// Build an `AnthropicProvider` and drive a turn through `LlmProvider::chat`,
/// draining the `ChatStream`. Same JS request shape as `anthropic_chat`, but
/// every byte flows through the real harness trait — the Wave B/C proof.
#[wasm_bindgen]
pub async fn provider_chat(req: JsValue) -> Result<JsValue, JsValue> {
    let req: crate::anthropic::ChatRequest = serde_wasm_bindgen::from_value(req)
        .map_err(|e| JsValue::from_str(&format!("bad request: {e}")))?;

    // Route to the selected provider's LlmProvider impl.
    let provider: Box<dyn LlmProvider> = match req.provider.as_deref() {
        Some("deepseek") => {
            Box::new(crate::deepseek::DeepSeekProvider::new(req.api_key.clone(), req.model.clone()))
        }
        _ => Box::new(AnthropicProvider::new(req.api_key.clone(), req.model.clone())),
    };

    // Assemble an engine ChatRequest from the JS payload.
    use std::sync::Arc;
    let messages: Vec<iacoder_core::Message> = req
        .messages
        .iter()
        .map(|m| iacoder_core::Message {
            role: match m.role {
                crate::anthropic::Role::Assistant => Role::Assistant,
                crate::anthropic::Role::User => Role::User,
            },
            content: vec![Content::Text {
                text: Arc::from(m.content.as_str()),
            }],
            tool_calls: Vec::new(),
        })
        .collect();

    let core_req = ChatRequest {
        model: req.model.clone().unwrap_or_default(),
        messages: Arc::new(messages),
        tools: Arc::new(Vec::new()),
        system: req.system.clone(),
        params: Default::default(),
        parallel_tool_calls: None,
        stream: false,
        metadata: Default::default(),
        cache_strategy: Default::default(),
        thinking_budget: None,
        safety: Default::default(),
    };

    let mut text = String::new();
    let mut input_tokens = 0;
    let mut output_tokens = 0;
    let mut stop_reason = "Other".to_string();

    let mut stream = provider
        .chat(core_req)
        .await
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    while let Some(ev) = stream.next().await {
        match ev.map_err(|e| JsValue::from_str(&e.to_string()))? {
            StreamEvent::TextDelta(t) => text.push_str(&t),
            StreamEvent::Usage(u) => {
                input_tokens = u.input_tokens;
                output_tokens = u.output_tokens;
            }
            StreamEvent::Stop(r) => stop_reason = format!("{r:?}"),
            _ => {}
        }
    }

    let out = DriverResult {
        text,
        input_tokens,
        output_tokens,
        stop_reason,
    };
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&format!("encode: {e}")))
}
