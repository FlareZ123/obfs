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
