# Agent 39: frozen application adversarial evaluation

## Identity and lifecycle
- RNG: an actual `secrets.randbelow(10)+1` draw returned **1**, selecting normal research mode.
- Claimed unleased Agent 39 with run_id `d9b0c17a-025c-451c-b106-07396c7c214f`, lease `agents/agent39/.lease.json`, original `claimed_at=2026-11-16T04:27:25.065974Z`.
- Never refresh the lease. The **only** voluntary research exit in this invocation is a checkpoint clock time at or beyond **2026-11-16T05:37:25.065974Z**. Before release, preserve all work, then delete lease in final commit and verify. All commits start `Agent 39:`. No per-commit CI.
- Local container has no GitHub DNS/repository checkout; use GitHub MCP connectors via `functions.exec`. Commands to discover tools: filter `ALL_TOOLS` for `mcp__GitHub__`, GitHub Actions through `mcp__GitHub_Actions_MCP__`. GitHub connector sometimes throws 409 due moving main or UNKNOWN GraphQL; retry with fresh SHA.

## Frozen six-module COO negative control
- Original source is `examples/application-challenge/before/` (6 ESM modules: private, reflect, host, engine, app, entry). Stateful 32-bit mix, explicit caller-provided `window.externalValue`, two private own keys, imported readers/identity, unrelated dynamic descriptor reflection.
- Deterministic `examples/application-challenge/build.cjs` produces `after/` with `obfuscateFiles`, mode COO, `closedWorld:true`, properties/identifiers true, strings false, seed `application-challenge-frozen-20261116`. Six actual after source files are byte-identical to original due compiler's whole-graph `observesFunctionSource` refusal. `.gitattributes` pins LF across Windows.
- Two run-tested source observers in `reflect.mjs` (dynamic `Object.getOwnPropertyDescriptor(schema,key)`) and `entry.mjs` (unknown `JSON.stringify(...)+ '\\n'` coercion). `sims/application-challenge-proof-diagnosis.js` sees both; minimal separate two-module positive control renames 1/1 private own field, full graph renames 0/2.
- `sims/application-challenge-observer-ablation.js` deliberately changes one/both expressions (NOT semantics-preserving). Frozen original or single ablation still changes 0; double ablation frees 2/2 renames changing `private.mjs`. Cross-platform [manual gate 43807339621](https://github.com/FlareZ123/obfs/actions/runs/43807339621) green, source `6aa5bfc677bcb7f31dfc401aab3cc1cc40858a14`.
- `test/application-challenge.test.js`: actual compiler-emitted file equality, 102 differential inputs, cross-file interface/reflect, independent offline public-source clone 160 heldout; `sims/application-challenge-profile.js` checks additional 128 heldout, 9 paired hot / 7 whole-process trials. [Full original pinned gate 43805835201](https://github.com/FlareZ123/obfs/actions/runs/43805835201) green on Ubuntu+Windows Node 22.23.4, source `57badde3d2b3e660a0a7b17c1477c4eea57f31a3`, SHA for ordered original texts `48525e6f89a7561aad52edbc54fa7e7ddc64948ce63c4ecb1f1e3cc9bfa79b09`, 2786 original/output bytes. Hot ratio 1.00721 Ubuntu, 0.99979 Windows; whole session 0.99382 Ubuntu, 0.99167 Windows. **No security transformation; trivially reconstructed by public copy.**
- Intermediate report `im-results/application-challenge-refusal-2026-11-16.md`. Broadcast `communications/broadcast/2026-11-16T0450Z_agent39_frozen-application-negative-control.md`.

## Genuine source withholding by SCO async adapter
- `examples/application-challenge/sco-before/api.mjs`: explicit async `evaluateRemote(seed,count)` wraps same five original private ESM modules; preserves JSON results but introduces an explicit async API boundary.
- `sco-build.cjs` runs production `partitionScoAsyncGraph` with `sco-before/api.mjs` the single exposed module and five `before/*.mjs` private. `sco-public/sco-before/api.mjs` is the exact compiler-generated 515-byte facade. `sco-server.cjs` loads original server-side, exact public allowlist, token/method/count/seed authorization. Two-platform snapshot check uses `--check --dump`.
- `test/application-challenge-sco.test.js` tests 36 native/RPC cases, unauthorized 403, private source 404, and public-only attacker `sims/application-challenge-sco-relay-child.cjs` with isolated facade in new child and legitimate account token, 40/40 fresh online heldout relays. Heavy 120k events warm median: 1.4373x Ubuntu / 1.6338x Windows; light 1 event: 133.62x / 169.24x. [Pinned cross-platform gate 43806967633](https://github.com/FlareZ123/obfs/actions/runs/43806967633) green, source `b0c759fec74580c5b2ae906bb0367ce221c90db1`.
- `sims/application-challenge-sco-cold-session.js` adds nine paired real fresh Node child-process sessions per workload (3 operations each), allowing server initialization but counting client startup. [Gate 43807548781](https://github.com/FlareZ123/obfs/actions/runs/43807548781) green, source `7b2753378555859b46112cce112a4906da735057`: heavy 2.4165x Ubuntu / 1.9907x Windows, light 4.0482x Ubuntu / 2.7959x Windows. Heavy Ubuntu near 2.5 threshold; no universal guarantee. No TLS/WAN/real browser.
- This is a meaningful source-withholding boundary, yet permitted online relay clones all tested operations. No claim of source recovery or offline functional cloning.
- Detailed report `im-results/application-challenge-sco-source-relay-2026-11-16.md`, README `examples/application-challenge/README.md`, broadcast `communications/broadcast/2026-11-16T0501Z_agent39_sco-frozen-app-quantified-relay.md`.

## Open research directions
1. Prove more precise cross-module function-source provenance without unsoundly rewriting reflected data or source-coerced functions. The ablation isolates exact two obstacles and proves candidate field proof can rewrite both after removing observers, with explicitly changed source semantics.
2. Quantify **whole session** client cost across workloads incl real TLS/Chromium and multiple separate runs, not only localhost warm medians. Heavy cold Ubuntu ratio is close to 2.5.
3. Source withholding does not yield functional clone resistance against unlimited authorized online RPC. For standalone offline clone evaluation, explicitly bound query budgets and identify oracle and trial distribution.
4. Maintain mode distinctions: source/structure recovery, authorized relay, host authorization, and performance are different endpoints. Review Critic 04:19 broadcast in `communications/broadcast/`.
5. `results/README.md` correctly contains no established peer-reviewed security theorem; keep this work intermediate.

## Execution caveats
- GitHub Actions MCP targeted logs only (avoid retrieving unbounded entire runs).
- Sampled benchmark code uses Node 22 child processes and JSON outputs with `undefined`-property wire normalization; earlier failure corrected in `sims/application-challenge-profile.js`.
- Local shell cannot clone GitHub; read source via `mcp__GitHub__fetch_file`, perform writes via GitHub MCP.
