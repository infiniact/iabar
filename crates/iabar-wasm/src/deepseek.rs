//! `DeepSeekProvider` — an OpenAI-compatible `LlmProvider` over browser fetch.
//!
//! DeepSeek speaks the OpenAI Chat Completions wire format
//! (`POST https://api.deepseek.com/chat/completions`, `Authorization: Bearer`).
//! Same `?Send` trait shape as `AnthropicProvider` (Wave B). Non-streaming for
//! now: one request, emitted as a single `TextDelta` + `Usage` + `Stop`.

use async_trait::async_trait;
use futures::stream;
use serde::{Deserialize, Serialize};

use iacoder_core::{
    ChatRequest, ChatStream, Content, LlmProvider, ProviderCapabilities, ProviderError, Role,
    StopReason, StreamEvent, Usage,
};

const API_URL: &str = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL: &str = "deepseek-chat";
const DEFAULT_MAX_TOKENS: u32 = 4096;

/// A fetch-backed DeepSeek (OpenAI-compatible) provider.
#[derive(Debug)]
pub struct DeepSeekProvider {
    api_key: String,
    model: String,
}

impl DeepSeekProvider {
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
    stream: bool,
}

#[derive(Deserialize)]
struct WireResp {
    #[serde(default)]
    choices: Vec<WireChoice>,
    #[serde(default)]
    usage: Option<WireUsage>,
    #[serde(default)]
    error: Option<WireErr>,
}

#[derive(Deserialize)]
struct WireChoice {
    #[serde(default)]
    message: WireOut,
}

#[derive(Deserialize, Default)]
struct WireOut {
    #[serde(default)]
    content: String,
}

#[derive(Deserialize, Default)]
struct WireUsage {
    #[serde(default)]
    prompt_tokens: u32,
    #[serde(default)]
    completion_tokens: u32,
}

#[derive(Deserialize)]
struct WireErr {
    #[serde(default)]
    message: String,
}

/// Engine messages → OpenAI messages. The engine carries `system` separately,
/// so prepend it as a `system` role message.
fn to_wire(req: &ChatRequest) -> Vec<WireMsg> {
    let mut out = Vec::new();
    if let Some(sys) = &req.system {
        if !sys.is_empty() {
            out.push(WireMsg { role: "system", content: sys.clone() });
        }
    }
    for m in req.messages.iter() {
        let role = match m.role {
            Role::System => "system",
            Role::Assistant => "assistant",
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
        if !text.is_empty() {
            out.push(WireMsg { role, content: text });
        }
    }
    out
}

#[async_trait(?Send)]
impl LlmProvider for DeepSeekProvider {
    fn id(&self) -> &str {
        "deepseek"
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
            stream: false,
        };

        let resp = reqwest::Client::new()
            .post(API_URL)
            .bearer_auth(&self.api_key)
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
            return Err(if status.as_u16() == 401 || status.as_u16() == 403 {
                ProviderError::Auth(err.message)
            } else {
                ProviderError::Provider(err.message)
            });
        }

        let text = parsed
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .unwrap_or_default();
        let wu = parsed.usage.unwrap_or_default();
        let usage = Usage {
            input_tokens: wu.prompt_tokens,
            output_tokens: wu.completion_tokens,
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
