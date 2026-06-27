# Licensing — iabar

iabar is composed of **two parts with a deliberately sharp licensing boundary**.
Read this before redistributing any part of iabar.

Copyright (c) 2026 INFINIACT CO., LTD.

---

## Zone 1 — the iabar **shell** → MIT

iabar's own source code (the "shell" around the engine) is licensed under the
**MIT License** (see [`LICENSE`](./LICENSE)). You may use, modify, and
redistribute it under MIT. This covers, and only covers:

| Path | What |
| --- | --- |
| `src/**` | TypeScript front-end — side panel, background SW, content script, `harness` |
| `crates/iabar-wasm/src/**` | The **wasm-bindgen bridge source** (`lib.rs`, `provider.rs`, `anthropic.rs`) — iabar's own glue |
| `manifest.config.ts`, `vite.config.ts`, `tsconfig*.json`, `package.json` | Build / packaging config |
| `README.md`, `ROADMAP.md`, `MIGRATION.md`, `LICENSING.md` | Repo documentation (planning docs under `docs/` are kept local and not redistributed) |

SPDX for these files: `MIT`.

## Zone 2 — the iacoder **engine** → Proprietary

The **iacoder agent engine is proprietary** and is **NOT** licensed under MIT.
The MIT grant in Zone 1 does not extend to any of the following:

| Item | Status |
| --- | --- |
| The iacoder Rust crates (`iacoder-core`, `iacoder-hooks`, `iacoder-agent`, …) consumed by **path** from the **private** `../iacoder` repository | Proprietary; **source not included** in this repo; governed by iacoder's own license |
| `crates/iabar-wasm` **as a compiled unit** (it statically links the engine) | The build output is a derivative of proprietary code |
| `iabar_wasm_bg.wasm` and `src/wasm/**`, `dist/**/*.wasm` | **Compiled binary that embeds the iacoder engine** — proprietary artifact |

---

## The boundary, stated precisely

1. **MIT covers the shell *source* you can read in this repo.** Nothing more.
2. **The compiled engine binary is a derivative work of proprietary iacoder code.**
   Redistribution of that binary (e.g. the packed extension, the `.wasm`) is
   governed by the **iacoder proprietary license**, not by MIT.
3. **Building the full extension from source requires access to the private
   `iacoder` repository** under its own terms. Cloning the public shell alone
   does **not** grant any right to the engine; the shell will not build into a
   shippable extension without the engine, by design.
4. **No sublicensing of the engine via the shell.** The MIT permissions on Zone 1
   (including "sell" / "sublicense") apply to the shell source only and confer no
   rights over Zone 2.

## Why proprietary engine + MIT shell is coherent with iabar's privacy stance

A closed engine means "read the source to trust it" is unavailable. iabar
substitutes a **stronger, user-operable trust root**: complete **egress traffic
audit**. The engine holds no direct network exit — 100% of its HTTP goes through
a single iabar-host seam (wasm calls a JS `host_fetch` import; it never opens a
socket itself), so the audit is **complete by construction**, not best-effort.
Every request is logged to a local append-only store (never leaves the device),
non-provider destinations are **blocked by default** (CSP `connect-src` /
`declarativeNetRequest`, enforced by Chrome), and credential headers are never
recorded. Trust shifts from *source-readability* to *behavior-verifiability*.
The shell being MIT lets anyone inspect exactly how the engine is invoked and how
the audit seam is wired — so the boundary itself is open to scrutiny even though
the engine is not.

This document is the canonical statement of the licensing boundary; the full
design rationale (egress-audit architecture, sovereignty invariants) lives in
iabar's local design docs and is not redistributed.
