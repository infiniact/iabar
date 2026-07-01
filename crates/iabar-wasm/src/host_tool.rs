//! Host-injected browser tools — the Rust→JS tool seam.
//!
//! Native `iacoder-tools` (shell/fs/browser/computer-use) are `cfg`'d out on
//! wasm. Browser capabilities instead live on the JS host: the side panel passes
//! a list of tool definitions (name/description/input_schema) plus one dispatch
//! callback `(name, argsJson) -> Promise<string>`. Each definition becomes a
//! generic [`HostTool`] whose `call` invokes the callback. So adding a new
//! browser tool (read_page, drill_down, screenshot, …) is a JS-only change —
//! no Rust edit, no wasm rebuild.

use std::sync::Arc;

use async_trait::async_trait;
use wasm_bindgen::JsValue;

use iacoder_core::{
    Content, Tool, ToolAnnotations, ToolContext, ToolDefinition, ToolError, ToolOutput,
    ToolOutputMeta,
};

fn err_output(msg: impl Into<String>) -> ToolOutput {
    ToolOutput {
        content: vec![Content::text(msg.into())],
        is_error: true,
        metadata: ToolOutputMeta::default(),
    }
}

fn js_err_string(e: &JsValue) -> String {
    e.as_string().unwrap_or_else(|| format!("{e:?}"))
}

/// A browser tool whose execution dispatches to a JS callback. Its metadata
/// (name/description/schema) is supplied by the host at run start.
pub struct HostTool {
    name: String,
    description: String,
    input_schema: schemars::Schema,
    dispatch: js_sys::Function,
}

impl HostTool {
    pub fn new(
        name: String,
        description: String,
        input_schema: serde_json::Value,
        dispatch: js_sys::Function,
    ) -> Self {
        // Build a `schemars::Schema` from the JSON the host provided (the same
        // `from_value` path the engine uses). Fall back to a permissive object.
        let input_schema = serde_json::from_value(input_schema).unwrap_or_else(|_| {
            serde_json::from_value(serde_json::json!({ "type": "object" }))
                .expect("object schema is valid")
        });
        Self {
            name,
            description,
            input_schema,
            dispatch,
        }
    }
}

impl std::fmt::Debug for HostTool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HostTool({})", self.name)
    }
}

#[async_trait(?Send)]
impl Tool for HostTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: self.name.clone(),
            description: self.description.clone(),
            input_schema: self.input_schema.clone(),
            annotations: ToolAnnotations {
                readonly: true,
                ..Default::default()
            },
        }
    }

    /// Forward the raw args to the host dispatcher and await its string result.
    /// A JS throw / rejection surfaces to the model as an `is_error` output
    /// rather than aborting the run.
    async fn call(
        &self,
        args: Arc<serde_json::Value>,
        _ctx: &ToolContext,
    ) -> Result<ToolOutput, ToolError> {
        let args_json = serde_json::to_string(&*args).unwrap_or_else(|_| "{}".into());
        let ret = match self.dispatch.call2(
            &JsValue::NULL,
            &JsValue::from_str(&self.name),
            &JsValue::from_str(&args_json),
        ) {
            Ok(v) => v,
            Err(e) => {
                return Ok(err_output(format!(
                    "{}: dispatch failed: {}",
                    self.name,
                    js_err_string(&e)
                )))
            }
        };
        // The callback may return a Promise or a plain value — resolve both.
        let promise = js_sys::Promise::resolve(&ret);
        match wasm_bindgen_futures::JsFuture::from(promise).await {
            Ok(v) => Ok(ToolOutput {
                content: vec![Content::text(v.as_string().unwrap_or_default())],
                is_error: false,
                metadata: ToolOutputMeta::default(),
            }),
            Err(e) => Ok(err_output(format!("{}: {}", self.name, js_err_string(&e)))),
        }
    }
}
