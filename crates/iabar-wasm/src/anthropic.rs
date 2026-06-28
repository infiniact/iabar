//! A real Anthropic Messages API client compiled to wasm.
//!
//! This is the browser-side LLM path the IABar side panel calls. It mirrors
//! the shape of the engine's provider (`Role` / `Message` / a chat request)
//! so it drops into the harness once the provider trait's `Send` bounds are
//! made target-conditional (see docs/ROADMAP.md, Phase 3). For now it stands alone
//! and proves end-to-end browser → Claude works over the fetch backend.
//!
//! Networking note: extension pages may call `api.anthropic.com` directly when
//! the manifest grants the host and the request carries
//! `anthropic-dangerous-direct-browser-access: true`. The API key lives in
//! `chrome.storage`, never in code.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
/// Default per the Claude API reference — the latest, most capable model.
const DEFAULT_MODEL: &str = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS: u32 = 4096;

/// Conversation role. Matches the engine's `provider::Role` so messages move
/// across the boundary unchanged when the provider lands in the harness.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

/// One conversation turn the side panel sends in.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

/// What the side panel hands `anthropic_chat` (deserialized from JS).
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub api_key: String,
    /// Provider id: "anthropic" (default) routes to the Anthropic impl; any
    /// other id routes to the generic OpenAI-compatible impl, which uses
    /// `base_url` for the endpoint.
    #[serde(default)]
    pub provider: Option<String>,
    /// OpenAI-compatible base URL (e.g. `https://api.deepseek.com`). The chat
    /// path `/chat/completions` is appended. Ignored for the Anthropic route.
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub system: Option<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

// --- Anthropic wire types (request) ---

#[derive(Serialize)]
struct WireRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    messages: &'a [ChatMessage],
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<&'a str>,
}

// --- Anthropic wire types (response) ---

#[derive(Deserialize)]
struct WireResponse {
    #[serde(default)]
    content: Vec<ContentBlock>,
    #[serde(default)]
    stop_reason: Option<String>,
    #[serde(default)]
    usage: Option<Usage>,
    // Present on error envelopes (HTTP 4xx/5xx return `{type:"error", error:{..}}`).
    #[serde(default)]
    error: Option<ApiError>,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

#[derive(Deserialize, Serialize, Default)]
struct Usage {
    #[serde(default)]
    input_tokens: u32,
    #[serde(default)]
    output_tokens: u32,
}

#[derive(Deserialize)]
struct ApiError {
    #[serde(default)]
    message: String,
}

/// What `anthropic_chat` returns to JS.
#[derive(Serialize)]
struct ChatResult {
    text: String,
    stop_reason: Option<String>,
    usage: Usage,
}

/// Send a chat completion to Claude and return the assembled text.
///
/// `req` is a JS object: `{ apiKey, model?, system?, messages: [{role, content}], maxTokens? }`.
/// Resolves to `{ text, stopReason, usage }` or rejects with an error string.
#[wasm_bindgen]
pub async fn anthropic_chat(req: JsValue) -> Result<JsValue, JsValue> {
    let req: ChatRequest = serde_wasm_bindgen::from_value(req)
        .map_err(|e| JsValue::from_str(&format!("bad request: {e}")))?;

    let model = req.model.as_deref().unwrap_or(DEFAULT_MODEL);
    let body = WireRequest {
        model,
        max_tokens: req.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS),
        messages: &req.messages,
        system: req.system.as_deref(),
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(API_URL)
        .header("x-api-key", &req.api_key)
        .header("anthropic-version", API_VERSION)
        .header("anthropic-dangerous-direct-browser-access", "true")
        .json(&body)
        .send()
        .await
        .map_err(|e| JsValue::from_str(&format!("request failed: {e}")))?;

    let status = resp.status();
    let parsed: WireResponse = resp
        .json()
        .await
        .map_err(|e| JsValue::from_str(&format!("bad response ({status}): {e}")))?;

    if let Some(err) = parsed.error {
        return Err(JsValue::from_str(&format!(
            "anthropic error ({status}): {}",
            err.message
        )));
    }

    let text = parsed
        .content
        .iter()
        .filter(|b| b.kind == "text")
        .map(|b| b.text.as_str())
        .collect::<Vec<_>>()
        .join("");

    let result = ChatResult {
        text,
        stop_reason: parsed.stop_reason,
        usage: parsed.usage.unwrap_or_default(),
    };
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&format!("encode: {e}")))
}
