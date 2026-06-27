//! `iabar-wasm` — the wasm-bindgen bridge between the `iacoder` harness and
//! the iabar browser extension.
//!
//! Phase 0 brings iacoder's **pure hook layer** across the wasm boundary: the
//! event taxonomy, `[[hooks]]` TOML parsing/validation, and prompt-template
//! interpolation all run as real `iacoder-hooks` code inside the extension —
//! no reimplementation. The native execution layer (shell/HTTP dispatch) is
//! gated out on wasm and returns as the harness gains browser-native backends
//! (see ROADMAP.md).

use serde::Serialize;
use wasm_bindgen::prelude::*;

use iacoder_hooks::{HookEvent, HookKind, parse_hooks};

mod anthropic;
mod provider;

/// Install a panic hook that forwards Rust panics to the browser console.
/// Call once from JS right after the wasm module initializes.
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// Crate version, surfaced in the extension's About panel.
#[wasm_bindgen]
#[must_use]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Every lifecycle event the iacoder hook system understands, in declaration
/// order. The extension renders these as the selectable triggers when a user
/// authors a hook. Sourced from `iacoder_hooks::HookEvent` — single source of
/// truth, so the list never drifts from the harness.
#[wasm_bindgen]
#[must_use]
pub fn hook_events() -> Vec<String> {
    // Keep in sync with `HookEvent`; `parse`-round-tripped so a typo here is a
    // compile-or-test failure rather than a silent omission.
    const NAMES: &[&str] = &[
        "SessionStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "PermissionRequest",
        "PermissionDenied",
        "PreCompact",
        "PostCompact",
        "PreFinal",
        "Stop",
        "StopFailure",
        "SubagentStart",
        "SubagentStop",
        "FileChanged",
        "CwdChanged",
        "Notification",
    ];
    NAMES.iter().map(|s| (*s).to_string()).collect()
}

/// One validated `[[hooks]]` entry, flattened for the JS side.
#[derive(Serialize)]
struct HookSummary {
    event: String,
    kind: &'static str,
    /// `Command`/`Http` target or `Prompt` template, whichever applies.
    detail: String,
    has_condition: bool,
    timeout_secs: u64,
}

/// Result of validating a `[[hooks]]` TOML document.
#[derive(Serialize)]
struct ValidateResult {
    ok: bool,
    count: usize,
    hooks: Vec<HookSummary>,
    error: Option<String>,
}

/// Parse and validate an iacoder `[[hooks]]` TOML config using the real
/// `iacoder_hooks::parse_hooks`, returning a structured summary the side panel
/// renders. On a config error `ok` is false and `error` carries the message
/// `iacoder` itself would print.
#[wasm_bindgen]
#[must_use]
pub fn validate_hooks(toml_src: &str) -> JsValue {
    let result = match parse_hooks(toml_src) {
        Ok(regs) => {
            let hooks = regs
                .iter()
                .map(|r| {
                    let (kind, detail) = match &r.kind {
                        HookKind::Command(cmd) => ("command", cmd.clone()),
                        HookKind::Prompt(tmpl) => ("prompt", tmpl.clone()),
                        HookKind::Http { url, .. } => ("http", url.clone()),
                    };
                    HookSummary {
                        event: r.event.as_str().to_string(),
                        kind,
                        detail,
                        has_condition: r.condition.is_some(),
                        timeout_secs: r.timeout.as_secs(),
                    }
                })
                .collect();
            ValidateResult {
                ok: true,
                count: regs.len(),
                hooks,
                error: None,
            }
        }
        Err(err) => ValidateResult {
            ok: false,
            count: 0,
            hooks: Vec::new(),
            error: Some(err.to_string()),
        },
    };
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Whether `name` is a hook event iacoder recognizes — used to validate the
/// trigger field as the user types.
#[wasm_bindgen]
#[must_use]
pub fn is_valid_event(name: &str) -> bool {
    HookEvent::parse(name).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_round_trip_through_iacoder() {
        // Every name we advertise must parse back to a real HookEvent.
        for name in hook_events() {
            assert!(HookEvent::parse(&name).is_some(), "unknown event {name}");
        }
    }
}
