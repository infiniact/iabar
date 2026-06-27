# iabar porting roadmap

The goal: run the **full iacoder agent harness** in the browser via wasm —
provider/LLM calls, context management, and tool dispatch — not a JS
reimplementation. This is a staged port because iacoder is native-first. Each
phase keeps native iacoder builds byte-for-byte unchanged (everything is gated
behind `#[cfg(target_arch = "wasm32")]`) and leaves iabar shippable.

## The core constraints (why this is staged)

Compiling iacoder to `wasm32-unknown-unknown` hits four hard walls:

1. **Native deps don't build on wasm.** The workspace pins `reqwest` with
   `rustls-no-provider` + `http2`, `rustls` with `ring`, and `keyring`. These
   pull C/native crypto that has no wasm build. → Make them target-conditional;
   on wasm use reqwest's **fetch backend** (TLS handled by the browser) and
   replace `keyring` with `chrome.storage`.
2. **`std::time::Instant` / `SystemTime` panic on wasm.** Any timing or
   timeout code traps at runtime. → A wasm clock shim backed by
   `performance.now()` / `Date.now()`.
3. **`tokio` is partial on wasm.** No multi-thread runtime, no I/O driver, no
   `process`. → Restrict to `sync`/`macros`/`rt` (current-thread) and drive
   futures with `wasm-bindgen-futures`; gate out `tokio::process`.
4. **No filesystem or shell in the browser.** The whole point of a coding
   agent's tools. → Implement iacoder's tool traits with **browser backends**
   (virtual FS in IndexedDB/OPFS, DOM tools, `fetch`-based web tools).

## Phases

### ✅ Phase 0 — pipeline + first real crate (done)

- Cargo workspace, `iabar-wasm` cdylib, wasm-pack → Vite → MV3 build.
- `iacoder-hooks` wasm-gated: native execution layer (`dispatcher`,
  `sources::command`, `sources::http`) behind `cfg(not(wasm32))`; the pure
  layer (event taxonomy, `parse_hooks`, conditions, prompt interpolation)
  compiles to wasm. Surfaced as the **Hook Lab**.

### Phase 1 — the wasm clock + portability primitives

- New `iacoder-core` module `time` (or a tiny `iacoder-wasm-rt` crate):
  `now()` / `Instant`-equivalent gated to `performance.now()` on wasm.
- Audit `iacoder-core` for `Instant::now()` / `SystemTime::now()` /
  `std::thread` / `std::fs` and route through portable shims.
- **Exit:** a portability checklist; no behavior change on native.

### ✅ Phase 2 — `iacoder-core` compiles to wasm (done)

The linchpin. Deps target-conditioned (wasm reqwest = fetch/json; rustls,
keyring, directories, rig, tokio native-only). Native I/O gated on wasm with
the **pure types kept portable** — see `MIGRATION.md` (Wave A) for the
file-by-file gate list. `cargo build -p iacoder-core --target wasm32` passes;
native `cargo check` + tests green (zero regression).

### 🟡 Phase 3 — provider / LLM over fetch (partially landed)

**Done:** a real Anthropic Messages API client compiled to wasm
(`iabar-wasm::anthropic`), wired to the side-panel chat. reqwest's fetch
backend makes HTTPS calls to `api.anthropic.com` directly from the extension
page (host permission + `anthropic-dangerous-direct-browser-access: true`);
API keys live in `chrome.storage`. Default model `claude-opus-4-8`.

**✅ The `Send`-bound wall is cleared (Wave B).** `AnthropicProvider` now
implements `iacoder_core::LlmProvider` on wasm — the side-panel chat drives
through the trait (`provider_chat` → `LlmProvider::chat` → `ChatStream`). The
fix: `MaybeSendSync` supertrait + `cfg`'d `async_trait(?Send)` + `cfg`'d
`ChatStream` (see MIGRATION.md, Wave B). Native is unchanged — `dyn LlmProvider:
Send` still propagates, so the multi-threaded runtime spawns providers as before.

Original analysis (for reference) — `Send` was baked into the trait surface:

```rust
pub type ChatStream = Pin<Box<dyn Stream<...> + Send + 'static>>;  // requires Send
#[async_trait] pub trait LlmProvider: Send + Sync { async fn chat(...); }
```

The browser `fetch` API (and reqwest's wasm futures/streams) is `!Send` — JS
values can't cross threads. To plug the fetch client into the harness:

1. In `iacoder-core`, make the `Send` bounds target-conditional — `ChatStream`
   without `+ Send` on wasm, and `#[cfg_attr(target_arch="wasm32",
   async_trait(?Send))]` on `LlmProvider` / `ProviderFactory`.
2. In `iacoder-agent`, the runtime spawn sites use `tokio::spawn` (needs Send)
   on native; gate them to `spawn_local` on wasm.
3. Then implement `LlmProvider` for the wasm client and register it via
   `ProviderFactory`, replacing the standalone path.

- Non-streaming works today; streaming SSE on wasm needs web-sys
  `ReadableStream` (reqwest-wasm doesn't stream response bodies).
- **Exit:** the side panel drives Claude *through* `iacoder_core::LlmProvider`.

### Phase 4 — context management

- `iacoder-context` (tiktoken-rs, flate2 — both wasm-portable) on top of the
  wasm core. Token counting, compaction, cleaners run in-browser.
- **Exit:** context window + compaction visualized in the panel.

### Phase 5 — browser tool backends

The agent's hands. Implement iacoder's tool traits with browser impls:

- **Virtual workspace:** OPFS/IndexedDB-backed FS for `read`/`write`/`edit`/
  `glob`/`grep`.
- **Page tools:** read DOM, query/extract, edit content, screenshot — backed
  by the content script.
- **Web tools:** `web_fetch` / `web_search` via `fetch` from the SW.
- `shell` is unavailable in-browser → either omit, or proxy to an opt-in local
  companion (out of scope initially).
- **Exit:** the agent edits a virtual file and reads the live page.

### Phase 6 — the agent loop

- `iacoder-agent` (current-thread tokio + `wasm-bindgen-futures`): session,
  permissions, tool dispatch, streaming.
- Permission prompts → side-panel UI. Hooks: Phase-0 `dispatcher` returns on
  wasm using the wasm clock + a browser-backed `CommandRunner` (or HTTP-only).
- **Exit:** a real multi-turn agent run in the side panel — the original goal.

## Working agreements

- Every change to `../iacoder` is **wasm-gated**; run iacoder's native
  `cargo build` + `cargo test` after touching its crates to prove no
  regression (Phase 0 verified `iacoder-hooks` native still builds).
- iabar depends on iacoder by **path**; no fork. Upstreamable gates only.
- Keep `pnpm build` green at the end of every phase.
