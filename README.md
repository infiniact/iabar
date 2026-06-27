# iabar

**iacoder, in your browser.** A Chrome MV3 extension that runs the
[`iacoder`](https://github.com/infiniact/iacoder) agent harness as
WebAssembly — real iacoder Rust code, compiled to `wasm32`, executing inside
the extension's side panel. No reimplementation of the harness in JS.

> Note: `iacoder` is a **private, proprietary** repository (access by license).
> The iabar shell here is MIT; the engine it embeds is not — see
> [LICENSING.md](./LICENSING.md).

> Status: **Phase 0 — foundation.** The Rust→wasm→extension pipeline is live
> and runs real iacoder code (the hook subsystem). The full agent loop is
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
│                                                 │  iacoder-hooks  │   │
│                                                 │  (path dep,     │   │
│                                                 │   wasm-gated)   │   │
│                                                 └─────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

- **`crates/iabar-wasm`** — the `wasm-bindgen` bridge. A `cdylib` that depends
  on iacoder crates via relative `path` and re-exports a JS-facing API.
- **`iacoder`** lives in a **sibling repo** (`../iacoder`); iabar pulls its
  crates by path. Native-only concerns (OS keychain, native TLS, shell/fs
  tools, the timing-based dispatcher) are gated out on `wasm32` with
  `#[cfg(not(target_arch = "wasm32"))]`, so **native iacoder builds are
  unchanged** while the portable layers compile to wasm.
- **side panel** hosts the wasm module (extension pages permit WebAssembly via
  the `'wasm-unsafe-eval'` CSP grant). The MV3 service worker stays a thin
  message router.

### What runs today (Phase 0)

The **Hook Lab** panel parses and validates iacoder `[[hooks]]` TOML configs
using the genuine `iacoder_hooks::parse_hooks` — the same code the native
agent uses. The event taxonomy shown is `iacoder_hooks::HookEvent`, the single
source of truth.

## Prerequisites

- Rust `1.92.0` (pinned via `rust-toolchain.toml`) + `wasm32-unknown-unknown`
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) (`brew install wasm-pack`)
- Node + `pnpm`
- A checkout of [`iacoder`](https://github.com/infiniact/iacoder) at `../iacoder`
  (**private repo — access by license**; the public iabar shell alone will not
  build a shippable extension, by design — see [LICENSING.md](./LICENSING.md))

```sh
rustup target add wasm32-unknown-unknown
pnpm install
```

## Build & load

```sh
pnpm build          # builds wasm + typechecks + bundles to dist/
```

Then in Chrome: **Extensions → Developer mode → Load unpacked → `dist/`**.
Click the iabar toolbar icon to open the side panel.

### Develop

```sh
pnpm dev            # wasm (dev) + Vite with HMR
```

Load `dist/` once; @crxjs hot-reloads the extension on change.

## Layout

| Path                     | What                                            |
| ------------------------ | ----------------------------------------------- |
| `crates/iabar-wasm/`     | Rust → wasm bridge to the iacoder harness       |
| `src/sidepanel/`         | React side panel UI                             |
| `src/harness/`           | Typed JS front door to the wasm module          |
| `src/background/`        | MV3 service worker (message router)             |
| `src/content/`           | Content script (page-context extraction)        |
| `src/wasm/`              | wasm-pack output (generated; gitignored)        |
| `manifest.config.ts`     | MV3 manifest (@crxjs `defineManifest`)          |
| `ROADMAP.md`             | Staged plan to bring the full harness to wasm   |

## License

iabar splits into two licensing zones — see [LICENSING.md](./LICENSING.md) for the
precise boundary:

- **The iabar shell** (this repo's own source — `src/**`, the `crates/iabar-wasm`
  bridge source, build config, repo docs) is **MIT** — see [LICENSE](./LICENSE).
- **The iacoder engine** (pulled by path from the private `../iacoder` repo) and the
  **compiled `iabar_wasm_bg.wasm` binary that embeds it** are **proprietary**,
  licensed separately; the MIT grant does **not** extend to them.

Because the engine binary is proprietary (not source-readable), iabar earns trust
through **full egress traffic audit** rather than source disclosure — the
licensing boundary and the audit trust-root are stated in
[LICENSING.md](./LICENSING.md).
