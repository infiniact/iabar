# IABar

**Your AI agent, in your browser.** A Chrome MV3 extension that runs a real
AI agent harness as WebAssembly — genuine Rust engine code, compiled to
`wasm32`, executing inside the extension's side panel. No reimplementation of
the harness in JS.

> Note: the engine is a **private, proprietary** component (access by license).
> The IABar shell here is MIT; the engine it embeds is not — see
> [LICENSING.md](./LICENSING.md).

> Status: **Phase 0 — foundation.** The Rust→wasm→extension pipeline is live
> and runs real engine code (the hook subsystem). The full agent loop is
> ported in stages — see [ROADMAP.md](./ROADMAP.md).

## Architecture

```
┌──────────────────────── Chrome MV3 extension ────────────────────────┐
│                                                                      │
│  side panel (React)  ──────►  src/harness  ──────►  iabar_wasm.js    │
│   - Hook Lab (live)                                  (wasm-bindgen)   │
│   - Agent (roadmap)                                       │          │
│                                                           ▼          │
│  background SW  ◄──► content script            ┌─────────────────┐   │
│   (message router)   (page context)            │  iabar-wasm     │   │
│                                                 │  (cdylib)       │   │
│                                                 │    │            │   │
│                                                 │    ▼            │   │
│                                                 │  agent engine   │   │
│                                                 │  (git dep,      │   │
│                                                 │   wasm-gated)   │   │
│                                                 └─────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

- **`crates/iabar-wasm`** — the `wasm-bindgen` bridge. A `cdylib` that depends
  on the engine crates via a **git dependency** and re-exports a JS-facing API.
- The **engine** lives in a **private repo** (access by license); IABar pulls its
  crates as a **git dependency** — no local checkout or relative path. Native-only
  concerns (OS keychain, native TLS, shell/fs tools, the timing-based dispatcher)
  are gated out on `wasm32` with `#[cfg(not(target_arch = "wasm32"))]`, so
  **native engine builds are unchanged** while the portable layers compile to wasm.
- **side panel** hosts the wasm module (extension pages permit WebAssembly via
  the `'wasm-unsafe-eval'` CSP grant). The MV3 service worker stays a thin
  message router.

### What runs today (Phase 0)

The **Hook Lab** panel parses and validates the agent's `[[hooks]]` TOML configs
using the genuine engine `parse_hooks` — the same code the native agent uses.
The event taxonomy shown is the engine's `HookEvent`, the single source of truth.

## Prerequisites

- Rust `1.92.0` (pinned via `rust-toolchain.toml`) + `wasm32-unknown-unknown`
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) (`brew install wasm-pack`)
- Node + `pnpm`
- **Git access** to the private engine repo (**access by license**) — Cargo
  fetches the engine as a git dependency; **no local checkout / relative path
  needed**. The public IABar shell alone will not build a shippable extension,
  by design — see [LICENSING.md](./LICENSING.md)

```sh
rustup target add wasm32-unknown-unknown
pnpm install
```

## Build & load

```sh
pnpm build          # builds wasm + typechecks + bundles to dist/
```

Then in Chrome: **Extensions → Developer mode → Load unpacked → `dist/`**.
Click the IABar toolbar icon to open the side panel.

### Develop

```sh
pnpm dev            # wasm (dev) + Vite with HMR
```

Load `dist/` once; @crxjs hot-reloads the extension on change.

## Layout

| Path                     | What                                            |
| ------------------------ | ----------------------------------------------- |
| `crates/iabar-wasm/`     | Rust → wasm bridge to the AI agent harness      |
| `src/sidepanel/`         | React side panel UI                             |
| `src/harness/`           | Typed JS front door to the wasm module          |
| `src/background/`        | MV3 service worker (message router)             |
| `src/content/`           | Content script (page-context extraction)        |
| `src/wasm/`              | wasm-pack output (generated; gitignored)        |
| `manifest.config.ts`     | MV3 manifest (@crxjs `defineManifest`)          |
| `ROADMAP.md`             | Staged plan to bring the full harness to wasm   |

## License

IABar splits into two licensing zones — see [LICENSING.md](./LICENSING.md) for the
precise boundary (and the canonical naming of the proprietary engine):

- **The IABar shell** (this repo's own source — `src/**`, the `crates/iabar-wasm`
  bridge source, build config, repo docs) is **MIT** — see [LICENSE](./LICENSE).
- **The AI agent engine** (fetched via git from the private engine repo) and the
  **compiled `iabar_wasm_bg.wasm` binary that embeds it** are **proprietary**,
  licensed separately; the MIT grant does **not** extend to them.

Because the engine binary is proprietary (not source-readable), IABar earns trust
through **full egress traffic audit** rather than source disclosure — the
licensing boundary and the audit trust-root are stated in
[LICENSING.md](./LICENSING.md).
