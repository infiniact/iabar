# iabar — iacoder → wasm migration tracker

Sequenced port of the iacoder crates iabar needs, keyed to the **actual API
surface** the sibling `iaterm` (Tauri) app consumes — that surface is the
concrete "what must cross the wasm gate" list. Each wave keeps native iacoder
builds byte-for-byte unchanged (everything is `#[cfg(...wasm32)]`-gated) and
leaves iabar buildable. See ROADMAP.md for the architecture and the `Send`-bound
analysis.

## Portability classification (iaterm's usage)

🟢 portable type/logic · 🟡 blocked by `Send`/clock/native dep (gate surgery) ·
🔴 no browser equivalent (needs a backend or stub)

| iacoder symbol (used by iaterm) | class | wasm blocker / strategy |
|---|---|---|
| `content::Content`; `provider::{Message,Role,SamplingParams,ChatRequest,StreamEvent}` | 🟢 | pure serde — available once core compiles |
| `RequestMetadata,CacheStrategy,SafetyLevel,PermissionMode` | 🟢 | pure data |
| `Goal{Config,Budget,Context,Verdict}` | 🟢 | data; `GoalEvaluator` is a trait → 🟡 |
| `LlmProvider`,`ChatStream`,`factory::build_provider_with_key`,`set_default_user_agent` | 🟡 | **Send wall** — wasm `fetch` is `!Send` |
| `tool::{Tool,BoxedTool}`,`GoalEvaluator` | 🟡 | same `Send + async_trait` surgery |
| `now_ms()` (agent); credentials `Instant` | 🟡 | `Instant/SystemTime` panic on wasm → `performance.now()` shim |
| `StoragePaths,install_storage_paths,FsAuthorizationDomain,AccessWindow,NoopAccessWindow` | 🔴 | no native FS → OPFS/IndexedDB virtual root + virtual authz domain |
| `ExecProvider,ExecChild,ExecSpec,ExitStatus,ExecError` (shell) | 🔴 | no browser shell → wasm stub (unsupported) or proxy to a backend |
| `Session,SessionConfig,RunRequest,AgentBuilder,AgentEvent,AllowAll,disabling_advisor_policy` | 🟡 | core gate + `tokio::spawn`→`spawn_local` |
| `iacoder-tools`: `ChildRunner,append_agent_tool,Subagent*` | 🟡 | needs agent+Tool ready; subagent = nested wasm loop |
| `iacoder-mcp` | 🔴 | stdio/child-process transport impossible on wasm; HTTP+SSE only |

The whole 🟡 band is blocked by the **same `Send` surgery** (Wave B) — do it once, half the table unlocks.

## Waves

| wave | scope | exit criterion | status |
|---|---|---|---|
| **0** | `iacoder-hooks` → wasm; Rust→wasm→MV3 pipeline | Hook Lab runs real `parse_hooks` | ✅ done |
| **A** | gate native points so `iacoder-core` compiles to wasm (keep pure types; gate rig/exec/fs/tls/keyring/credentials impls) | `cargo build -p iacoder-core --target wasm32` ✅ | ✅ done |
| **B** | `Send` surgery: target-conditional `Send` on `ChatStream`/`LlmProvider`/`ProviderFactory` (via `MaybeSendSync` + cfg'd `async_trait`) | a wasm `impl LlmProvider` compiles & runs | ✅ done |
| **C** | provider real: `AnthropicProvider: LlmProvider` drives the side-panel chat; SSE streaming via web-sys `ReadableStream` | side panel chats **through `LlmProvider`** | 🟡 trait path live (non-streaming); SSE pending |
| **D** | agent runtime: `Session/AgentBuilder/AgentEvent/AllowAll`, iabar `GoalEvaluator`. Deps `context` ✅ + `tools` (E1) ✅. Agent wasm build: **31 errors → Send layer fixed (2)**; **29 structural refs remain** (Runtime wires gated `CredentialPool`/`HookDispatcher`/`default_exec_provider`/`factory`/`ApplyChangeTool`) | multi-turn agent run in the side panel | 🟡 deps + Send layer done; Runtime structural port pending |
| **E1** | `iacoder-tools` → wasm: target-condition native deps; gate native tool modules (fs/shell/image/pdf/ripgrep), keep the portable subset + `Tool` trait | `cargo build -p iacoder-tools --target wasm32` ✅ | ✅ done |
| **E2** | browser tool backends: `web_fetch`/DOM tools/OPFS-IndexedDB virtual FS for read/write/edit/glob/grep; `ExecProvider` stub; subagents; bring `web_search` back over fetch | agent edits a virtual file + reads the live page | ☐ |
| **F** | MCP: gate stdio transport; keep HTTP+SSE | connect an HTTP MCP server | ☐ |

## Wave A — what was gated (native unchanged; all `#[cfg(...wasm32)]`)

In `../iacoder/crates/iacoder-core`:

- **tls.rs** — `ensure_crypto_provider` is a no-op on wasm (browser owns TLS).
- **atomic.rs** — async `write_atomic` (`tokio::fs`) native-only; `write_atomic_sync` stays.
- **exec/mod.rs** — `DirectExec`/`DirectChild`/`default_exec_provider`/`run_capture` (`tokio::process`) native-only; `ExecProvider`/`ExecChild` traits + `ExecSpec`/`ExitStatus` stay.
- **storage/mod.rs** — `directories`-based helpers native-only; added a wasm `StoragePaths` impl returning a virtual `/iacoder/*` root.
- **config.rs** — `config::paths::*` fallbacks route through the virtual `default_storage_paths()` on wasm; `OAuthConfig::resolve` + `ModelPricing::from_openrouter` native-only.
- **credentials/** — whole module native-only (`tokio::time::Instant` pool + keyring); wasm uses `chrome.storage`.
- **provider/** — rig adapters, `factory` (incl. `build_model`/`resolve_context_window`), and the discovery cluster (`discovery`/`discovery_flow`/`discovery_persist`/`models_list`/`openrouter_catalog`) native-only. The provider **types** (`Message`/`Role`/`ChatRequest`/`StreamEvent`/`Usage`/…), `LlmProvider`/`ProviderFactory` traits, and `failover`/`inference`/`identity`/`registry` stay portable.

Verified: `cargo check -p iacoder-core` (native) + storage/atomic/config tests green.

## Wave B — the `Send` surgery (native unchanged)

In `iacoder-core`:

- Added `MaybeSendSync` (lib.rs): `Send + Sync` on native, empty on wasm, with
  blanket impls. Used as the supertrait on `LlmProvider` / `ProviderFactory`
  in place of `Send + Sync` — so on native `dyn LlmProvider` keeps auto-trait
  `Send` propagation (the multi-threaded runtime still `tokio::spawn`s it) and
  on wasm a `!Send` fetch provider can implement it.
- `ChatStream`: two `cfg`'d aliases (`+ Send` native, no `Send` wasm).
- `LlmProvider`: `#[cfg_attr(not(wasm32), async_trait)]` /
  `#[cfg_attr(wasm32, async_trait(?Send))]`.

In `iabar-wasm`: `provider.rs` defines `AnthropicProvider` and
`#[async_trait(?Send)] impl LlmProvider for AnthropicProvider`. The
`provider_chat` wasm-bindgen fn assembles an `iacoder_core::ChatRequest`, calls
`LlmProvider::chat`, and drains the `ChatStream` — the side-panel chat now flows
through the real harness trait.

Verified: `cargo check -p iacoder-core -p iacoder-agent -p iacoder-tools`
(native, clean — `dyn LlmProvider: Send` preserved); `cargo build -p iabar-wasm
--target wasm32` (clean); `pnpm build` green.

Agent-side `spawn`→`spawn_local` is deferred to Wave D (the agent crate hasn't
crossed the wasm gate yet).

## Wave D (prep) — `iacoder-context` ported

`Compressor` trait + its 4 impls (`TokenBudget`/`MidSummarize`/`ToolResultShrink`/
`ToolResultSummarize`) got the same `MaybeSendSync` + conditional-`async_trait`
surgery (they hold `Arc<dyn LlmProvider>`, `!Send` on wasm). `Cleaner` left as
`Send + Sync` (its impls don't hold `!Send` types). `cargo build -p
iacoder-context --target wasm32` ✅; native `cargo check` ✅.

**The agent loop is now gated on Wave E (`iacoder-tools`).** `iacoder-agent`'s
runtime constructs concrete tools (`ReadTool`/`ShellTool`/`ApplyChangeTool`/
`ChildRunner`/…) and uses `tokio::time`/`std::time::Instant`/`SystemTime`
throughout — so it can't compile to wasm until `iacoder-tools` does and the
timer/clock are shimmed. Tools is the largest single chunk (native fs/shell/
image/pdf/ripgrep); see the Wave E row.

## Wave E1 — `iacoder-tools` compiles to wasm (native unchanged)

- **Cargo.toml**: `reqwest`/`tokio`/`which`/`image`/`pdf-extract`/`pdfium`/
  `ignore` → `[target.'cfg(not(wasm32))'.dependencies]`; wasm gets reqwest-fetch
  + minimal tokio. `globset`/`grep-*`/`memchr`/`html2text` stay common.
- **lib.rs**: native tool modules gated (`agent`, `apply_change`, `browser`,
  `cli_agent_runner`, `computer_use`, `edit`, `glob`, `grep`, `image_view`,
  `notebook_edit`, `read`, `shell`, `terminal`, `todo`, `web_fetch`, `worktree`,
  `write`, `agent_catalog`, `web_search`) + their re-exports + the `builtin*` /
  `append_*` registry fns. **Portable subset kept**: `activate_skill`,
  `ask_user`, `discover_tools`, `outline::outline_lines`, `plan_mode`,
  `subagent_roles`, `think` (+ the `Tool`/`BoxedTool` trait from core).
- **outline.rs**: `OutlineTool` (reads files) gated; pure `outline_lines` stays.
- **plan_mode.rs**: worktree entries in `PLAN_MODE_DESTRUCTIVE_TOOLS` cfg'd out
  on wasm (worktree tool isn't registered there).

Verified: `cargo build -p iacoder-tools --target wasm32` ✅; native `cargo check
-p iacoder-tools -p iacoder-agent` ✅ (full tool API intact on native).

`web_search` is gated for now (reqwest `.timeout()` + `!Send` fetch); it returns
in E2 once its backends drop `.timeout()` and the `Tool` impl goes `?Send`.

## Wave D (progress) — agent Send layer done; Runtime structural port pending

The agent's wasm build surfaced **31 errors** — a clean, well-bounded set:

- **Send layer (2, done):** `GoalEvaluator` (core) + `BehavioralClassifier`
  (agent) traits and their LLM-backed impls (`AdvisorGoalEvaluator`,
  `LlmBehavioralClassifier`) got the `MaybeSendSync` + conditional-`async_trait`
  surgery. Native `cargo check -p iacoder-core -p iacoder-agent` ✅.
- **Structural (29, pending):** the `Runtime` struct + `AgentBuilder` wire
  subsystems that are gated on wasm:
  - `pool: Option<Arc<CredentialPool>>` — credentials gated (tokio-time pool)
  - `hook_dispatcher: Option<HookDispatcher>` — hooks dispatcher gated
  - `default_exec_provider()` / `run_capture` — exec gated
  - `factory` / `build_model` / `resolve_context_window` — provider construction gated
  - `ApplyChangeTool`, `iacoder_tools::shell::MAX_TIMEOUT_MS` — gated tools

  Two ways to resolve, both substantial:
  - **(A) port the subsystems** — make `CredentialPool` + `HookDispatcher`
    compile on wasm (needs the wasm-clock shim for their `tokio::time::Instant`
    usage) + exec/factory wasm stubs. Keeps the `Runtime` struct intact.
  - **(B) gate the Runtime** — `#[cfg]` the `pool`/`hook_dispatcher` fields and
    every method that touches them, plus the builder's provider/exec/apply_change
    wiring. Contained to the agent crate but cascades through many methods.

  This is the largest single surgery left; best done as a focused pass.

  **Progress on (B)** (all `cfg(not(wasm32))`, native verified green throughout):
  exec wasm stubs landed (`WasmNoExec` + `default_exec_provider`/`run_capture`,
  in core); `hooks_exec` module + `ExecBackedRunner`/`HookDispatcher` re-exports
  gated. **The error count is cascading** (25 → 41 as gating one subsystem
  surfaces its dependents): the credential failover loop (`pool`/`CredentialLease`/
  `PoolError`, woven through a ~1000-line method), hook-firing sites, and more
  `?Send` traits (`PermissionGate`, …) are interconnected. Full agent-wasm
  compile needs a sustained focused pass (or a parallelized mechanical sweep) —
  not a single linear edit run. Native is unaffected at every step.

## Working agreements

- Every `../iacoder` edit is wasm-gated; run native `cargo check`/`build` after
  touching its crates (no regression — verified for hooks + core deps so far).
- iabar depends on iacoder by **path**; upstreamable gates only, no fork.
- Keep `pnpm build` green at the end of every wave.
