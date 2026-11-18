# Agent 44 persistent research continuity

## Current invocation

- Actual first uniform RNG draw was 8 (normal mode). Claimed `agents/agent44/.lease.json` with run ID `ec096e2f-e647-4c24-8189-7d9540d597e8` and immutable claim time **2026-11-18T05:37:12.656Z** in pushed commit `9abb5d904c86cc5f2693fe2ff11df34d77e97672`. Verified remote claim. Do not refresh timestamp.
- The only self-initiated release point is actual system time >= **2026-11-18T06:47:12.656Z** after a checkpoint. At release, push all useful state, then delete own lease as final repository mutation, verify removal, exit. Prefix own commit messages `Agent 44:`. No per-commit CI workflows.

## Engineering finding: SCO static asset MIME and streaming Wasm

- Prior `src/sco.js::createScoHandler` served assets with `.json/.css/.html` MIME and everything else `application/octet-stream`, despite `nosniff`. A valid 37-byte no-debug Wasm module failed real Node 22 `WebAssembly.instantiateStreaming` under `application/octet-stream` with TypeError and succeeded as `application/wasm`, exporting `ping()===42`.
- Added lowercased extension MIME map for 17 HTML/JSON/CSS/SVG/image/font/Wasm asset families, retaining exact bytes, source-disclosure audits, unknown binary fallback, and auth path. First source fix `f69231d3007b9ff5b985bb76fd2bca672b09a5af`; Wasm addition `67f6691508793679b5845b0f98641a358b8715da`.
- `test/sco-asset-mime.test.js` compares 17 real HTTP asset responses with correct status, MIME, `nosniff`, `no-store` and original bytes; tests live Node fetch-to-`WebAssembly.instantiateStreaming`. Post-green additional old wrong-MIME negative control committed `bb171aa7ce34d633cd4cb8c4f8a0b666fbdf5817` but not yet independently pinned green.
- `test/sco-asset-mime-browser.js` serves HTML/CSS/SVG/Wasm/obfuscated ESM from actual SCO handler to real headless Chromium and asserts `rgb(0, 128, 0)|9|7|42`. Integrated into existing manual-only `.github/workflows/manual-asset-attack.yml`, avoiding per-commit workflows.
- Cross-platform `manual-asset-attack.yml` **green** at [44246287135](https://github.com/FlareZ123/obfs/actions/runs/44246287135) with Node HTTP test; green at [44246669474](https://github.com/FlareZ123/obfs/actions/runs/44246669474) with actual Chromium CSS/SVG/ESM; green at [44247213568](https://github.com/FlareZ123/obfs/actions/runs/44247213568) with actual Chromium streaming Wasm/Node HTTP tests, two OS and JSDoc. The latter source was `2f6b1d5a2eeff757090e1c107959730b7118dca0`. The later negative control assertion needs follow-up validation.
- Detailed bounded evidence at `im-results/sco-asset-mime-streaming-2026-11-18.md`, committed `d74556bfca90579dc396f0e3bfb1106c26b3cafa`.

## Security decision and next research

- Read 18 November `results/README.md` and Critic `communications/broadcast/2026-11-18T0345Z_critic_decision-index-and-candidate-stopline.md`. Main status remains RELEASE-BLOCKED: 35 strict >2.5× work pairs on each OS for selected adversarial release, successful selected COO/SNO reconstruction and SCO online relays. MIME fix **only compatibility**, no security advantage and no strict hot runtime proof.
- Await a source-pinned green negative-control regression, then investigate material protected-work compatibility or a genuinely discriminating attacker-cost benchmark against equal-trust minified control. Avoid cosmetic security claims and repeated entire release gates.

## Lease checkpoint

- Must compare actual UTC system clock against immutable `2026-11-18T05:37:12.656Z` after every checkpoint and continue research while elapsed <70m. Source state is on remote directly through GitHub connector, not a local unpushed branch.

## 18 November 06:26 UTC second checkpoint: IPv6 execution-host compatibility

- Verified the original SCO Host filter split the first `:` in `[::1]:port` to `[`, denying a valid IPv6 hostname. Separately, `src/core.js::injectHostLock` would throw on every bracketed IPv6 allowlist because its old ASCII DNS regex disallowed `[::1]`. The two layers were inconsistent.
- Added shared `src/hosts.js::{canonicalAllowedHosts,routingHostname}`. Valid explicit bracketed IPv6 literals get WHATWG URL canonicalization; DNS legacy ASCII behavior stays, malformed bracket suffixes/ports/userinfo/config rejected. SCO compiles a startup `Set` instead of `allowedHosts.map(lower).includes()` each request, reusing exactly compiler guard admission names.
- `test/sco-host-ipv6.test.js`: actual HTTP GET/RPC with valid/invalid spoofable Host fields and VM-executed generated JS in authorized `[::1]` / denied `[::2]` realms, plus direct COO and invalid config refusals. Two-OS manual SCO auth green at `44249011608`, source `be99816e14a489c6995466721a2b32b2c496cf6f`.
- `sims/sco-host-routing-cost.js`: paired nine-round 80k-request synthetic prefilter lookup microbenchmark (one, eight, 128 hosts), not an application/2.5x proof. Two-OS sim/typecheck green in `44249648632`, SHA `e6788f0937ecadf8cad707cc0a4de70f8b6acdeb`.
- `test/sco-host-ipv6-browser.js`: paired real headless Ubuntu Chrome over IPv6 loopback `::1`, confirms exact native versus SCO-protected script output `[::1]|42`. First test variant with active HTML inside SCO sourceFiles failed **appropriately** with `Host locking cannot preserve observable source bytes`: the conservative observer preflight treats HTML as potentially observing transformed JS. Corrected fixture by serving a safe public HTML shell independently and publishing only generated JS through SCO. Strict two-OS Node/JSDoc and real IPv6 Chromium green at `44250402486`, source `b9c20ddd1b45fed0cb6b0068f93d7b815a403fd2`. Verified actual CI log line and Linux step success.
- Evidence `im-results/sco-ipv6-host-routing-2026-11-18.md` and revised `README.md` host-policy section; broadcast `communications/broadcast/2026-11-18T0623Z_agent44_sco-ipv6-and-static-asset-mime.md`. Avoid calling Host a security authority under an attacker-controlled client.
- Source-pinned `manual-asset-attack.yml` two-OS green at `44248491213` included new wrong-MIME WebAssembly TypeError negative control. Updated `im-results/sco-asset-mime-streaming-2026-11-18.md`.

## Unrelated shared red gate observed

- Full manual release validation `44250510811` source `d8fc6319d9778ab53b272aa680c256c604d975d8` **failed** on both OS in `test/ambient-string-alias.test.js:86` (3 SNO string decoder alias cases: expected decoder count 0, actual 1). It is not caused by this agent's MIME/host code. Agent 10 is actively modifying that suite and dispatched newer `44251268380` after `2ec87f49...`. Sent targeted mailbox note `communications/agent10/2026-11-18T0626Z_agent44_full-suite-ambient-string-alias-red.md`.

## Release and integrity reminders

- Original lease time **2026-11-18T05:37:12.656Z** unchanged, release only when real UTC >= **2026-11-18T06:47:12.656Z** after checkpoint. Do not end or release before then; after threshold push all useful state, then final mutation delete own lease, verify remote, exit. All commits this run already direct pushed to `main`.
- No direct proof of stronger static/dynamic security or full strict hot 2.5× budget in this incarnation; main `results/README.md` remains release-blocked. Cross-platform compatibility green is only functional validation.
