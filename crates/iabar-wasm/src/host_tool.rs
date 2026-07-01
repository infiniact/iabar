//! Host-injected browser tools — the Rust→JS tool seam.
//!
//! Native `iacoder-tools` (shell/fs/browser/computer-use) are `cfg`'d out on
//! wasm. Browser capabilities instead live here: a `Tool` impl whose `call`
//! dispatches to a JS callback the host (the extension side panel) provides,
//! which runs the actual `chrome.*` work and returns a string. This is the seam
//! every future browser tool (screenshot, navigate, click, …) plugs into.

use std::sync::Arc;

use async_trait::async_trait;
use schemars::{schema_for, JsonSchema};
use serde::Deserialize;
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

/// Call the host dispatcher `(name, argsJson) -> Promise<string>` and await it.
/// A JS throw / rejection is surfaced to the model as an `is_error` output
/// rather than aborting the run.
async fn dispatch_host(
    dispatch: &js_sys::Function,
    name: &str,
    args: &Arc<serde_json::Value>,
) -> Result<ToolOutput, ToolError> {
    let args_json = serde_json::to_string(&**args).unwrap_or_else(|_| "{}".into());
    let ret = match dispatch.call2(
        &JsValue::NULL,
        &JsValue::from_str(name),
        &JsValue::from_str(&args_json),
    ) {
        Ok(v) => v,
        Err(e) => return Ok(err_output(format!("{name}: dispatch failed: {}", js_err_string(&e)))),
    };
    // Resolve whether the callback returned a Promise or a plain value.
    let promise = js_sys::Promise::resolve(&ret);
    match wasm_bindgen_futures::JsFuture::from(promise).await {
        Ok(v) => Ok(ToolOutput {
            content: vec![Content::text(v.as_string().unwrap_or_default())],
            is_error: false,
            metadata: ToolOutputMeta::default(),
        }),
        Err(e) => Ok(err_output(format!("{name}: {}", js_err_string(&e)))),
    }
}

// ---------- read_page ----------

#[derive(Debug, Deserialize, JsonSchema)]
struct ReadPageInput {
    /// URL of an open tab to read. Omit to read the current active tab.
    #[serde(default)]
    url: Option<String>,
}

/// Reads the visible text of a browser tab (via the host's page-context
/// capture). Only pages the user has granted access to are readable.
pub struct ReadPageTool {
    dispatch: js_sys::Function,
}

impl ReadPageTool {
    pub fn new(dispatch: js_sys::Function) -> Self {
        Self { dispatch }
    }
}

impl std::fmt::Debug for ReadPageTool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ReadPageTool")
    }
}

#[async_trait(?Send)]
impl Tool for ReadPageTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "read_page".into(),
            description: "Read the visible text of a browser tab. With no arguments, reads the \
                page the user is currently looking at; pass `url` to read a specific open tab. \
                Returns the page title, URL and text. Only pages the user has granted access to \
                are readable — if it isn't accessible, ask the user to @-reference it once."
                .into(),
            input_schema: schema_for!(ReadPageInput),
            annotations: ToolAnnotations {
                readonly: true,
                ..Default::default()
            },
        }
    }

    async fn call(
        &self,
        args: Arc<serde_json::Value>,
        _ctx: &ToolContext,
    ) -> Result<ToolOutput, ToolError> {
        dispatch_host(&self.dispatch, "read_page", &args).await
    }
}
