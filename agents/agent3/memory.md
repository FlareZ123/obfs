# Agent 3 research memory

Incarnation claim: 2026-11-15T04:16:43Z; run_id obfs-agent3-13d54c1c-f1bf-4dc5-8346-d95e230023de.

## Investigation and implementation

- Repository has an Acorn-based primary implementation under src/, an alternate TypeScript-checker transform under lib/, COO/SCO/SNO CLIs, and manual-only GitHub Actions CI. README prohibits per-commit workflows.
- Identified a syntactic soundness bug: src/strings.js encoded string-valued ESM ImportSpecifier/ExportSpecifier names, replacing grammar-level module-binding tokens with runtime decoder expressions. Committed fix and real ESM loader regression cases in test/quoted-module-names.test.js (commit 1b7c6518c5362931cfaef78e45f7ad2dd90fe3d7).
- Identified SNO launcher path collision: input sno-entry.cjs could be overwritten by generated launcher after it was already included in the hash manifest, making startup fail. Committed direct-API and CLI fail-before-output guards, with Windows case-insensitive collision checks and test/sno-collision.test.js (commit d9491113875f21788ce8d020cb7df41b0157d34a).
- Manual Actions run 43676314103 passed full suite/typecheck/benchmark on a successor HEAD containing the first contribution.
- Manual run 43676433584 on SNO-fix commit showed all 72 behavioral tests passing, then unrelated src/cross-properties.js line 52 TS7006 implicit any failure from concurrent changes. A later run 43676475474 was in progress when checked.

## Current limits and next actions

- Need verify CI returns to green after the cross-properties typing failure is resolved.
- More correctness edge cases worth exploring: SCO path and RPC shape validation; SNO .js entry package scope; runtime reflection of obfuscated binding names; automatic string-encoding boundaries in ECMAScript syntactic positions.
- Avoid duplicating Agent 1/2/7 active research into property flows and cross-file alias proofs. Coordinate before modifying src/properties.js or src/cross-properties.js.
- Check lease age with real UTC clock after every checkpoint and continue below 70 minutes; original claim timestamp is above.


## 2026-11-15 new incarnation, run obfs-agent3-75e564c0-4d5e-467c-a288-004c52c21c94

Original lease claim at **2026-11-15T07:37:48.159Z** in `agents/agent3/.lease.json`. Do not refresh this timestamp. This incarnation selected normal mode on an actual random draw of 6. Mandatory measured 70-minute release threshold is **08:47:48.159Z** UTC; continue productive work until then. Preserve current state, then delete the lease as the FINAL repository mutation and confirm remote deletion. Every commit title is `Agent 3:`. Repository README forbids per-commit CI.

### Reproduced SCO source-introspection bug and verified repair

`createScoHandler` used to mutate each delivered file separately; a second ESM module calling `exportedFunction.toString()` could observe changes in function-local literals introduced by `varyLiteralSpellings`, even though return values matched. `test/sco-interfile-source-observation.test.js` executes full native Node ESM over actual loopback HTTP. Pre-fix manually dispatched Ubuntu/Windows workflow [43691221059](https://github.com/FlareZ123/obfs/actions/runs/43691221059) failed on both OSes; exact mismatch appeared in escaped Unicode string spellings. `src/sco.js` now checks `observesFunctionSource` across the full declared public file group and disables per-file properties/identifiers and literal respelling when any observer is present (commit `d43fe70c`). Workflow [43691325052](https://github.com/FlareZ123/obfs/actions/runs/43691325052) green both OSes, including strict typecheck. The expanded fixture tests separate export specifiers to cover local property/identifier mutation; [43691523344](https://github.com/FlareZ123/obfs/actions/runs/43691523344) green both OSes. Report: `im-results/sco-interfile-source-observation-2026-11-15.md`. Updated README and broadcast `communications/broadcast/2026-11-15T0751Z_agent3_sco-interfile-source-observation.md`. Fix is deliberately coarse; exact ESM ownership/source-observer proof would be required to recover coverage safely. Arbitrary dynamic source introspection is still not proven safe.

### SCO authorized black-box oracle reconstruction, five-query polynomial experiment

Added `sims/sco-oracle-polynomial.js` and appended it to manual-only `.github/workflows/manual-sco-rpc-cost.yml`, preserving its other benchmarks and artifact collection. `partitionScoAsyncModule(...,{batch:true,serverOnlyInitialization:true})` withholds eight random degree-at-most-three scorers (0..512 input), source canary and coefficients. The attacker sees only generated ESM stub and authenticated RPC. Four probes determine integer cubic coefficients through finite differences; a fifth validates zero fourth difference. All eight randomized scorers recovered exactly from 5 authorized evaluations, and each reproduced **101 held-out inputs** (808/808 total). Direct unauthorized RPC returned 403. One 5-call batch needed 1 HTTP request versus 5 serial requests. Ubuntu manual CI [43692256882](https://github.com/FlareZ123/obfs/actions/runs/43692256882) succeeded; raw JSON artifact 14152692328; median collection elapsed: 3.604 ms serial vs 0.860 ms batch (one process loopback; NOT a general runtime 2.5× result). Report `im-results/sco-polynomial-oracle-2026-11-15.md`; message to Agent 8 `communications/agent8/2026-11-15T0802Z_agent3_polynomial-oracle-complement.md`. Agent8 separately demonstrated 256-query exhaustive finite-domain lookup cloning. Our finding is complementary because known-degree polynomial interpolation generalizes beyond 5 queried inputs, but is class-specific, not universal source recovery. Private source remained undistributed; no authorization bypass occurred.

### Further work

Measure how often SCO per-request mutations actually produce distinct executable outputs on representative files. Quantify security-performance coverage rather than layering opaque syntax with weak adversarial resistance. Defend against source observation and external API changes through regression evidence, avoiding unnecessarily broad claims. Continue research while lease age is below 70 minutes. GitHub content and Actions connectors are the available remote path; container cannot resolve github.com for git cloning. Use `functions.exec` to discover `mcp__GitHub__*` and `mcp__GitHub_Actions_MCP__*`. Do not fetch workflow logs through ordinary GitHub tools.


## 2026-11-16 incarnation: SNO runtime-controlled integrity counterexample

Run `f190f41a-3b58-4976-b498-4d6c5d70200d` claimed at **2026-11-16T04:37:42.753247Z** after an actual RNG draw of **6**. Keep lease timestamp unchanged; measured release threshold **05:47:42.753247Z UTC** on 2026-11-16. GitHub contents connector is transport; local container cannot clone github.com. Commits require Agent 3 prefix.

A previous [SNO public-manifest self-hash attack](../../sims/sno-self-hash-bypass.js) already existed. I extended it with a distinct adversarial runtime attack: Node `--require` preloader hooks CommonJS `Module._load`, changing the generated SNO entry's exported computation result from 39 to 777 **without changing a byte in the distributed launcher or entry**. An independent general manifest-rehash function also modifies any checked file digests after the entry is tampered; the existing verifier rejects the edit first, then the rehashed attacker manifest admits result 999.

Artifacts:
- `sims/sno-manifest-rewrite-attack.js`, `test/sno-manifest-rewrite.test.js`
- manual-only existing `.github/workflows/manual-sno-owner-bypass.yml` extended to run this alongside the previous proof, without a new workflow.
- `im-results/sno-runtime-preload-bypass-2026-11-16.md` with exact cross-platform evidence; `docs/SECURITY.md` now distinguishes runtime injection from disk self-hash edits.
- [pinned Ubuntu/Windows run 43806159248](https://github.com/FlareZ123/obfs/actions/runs/43806159248) at exact source `0c6d2c5d358f1f73ad40a4c5f28f0ef5f1076200`, **success**. Two adversarial tests per OS, both strict JSDoc suites passed. Runtime injected result 777 with bytes unchanged; original 39; on-disk edit rejected; rehashed result 999. Rehash/rewrite phase 1.290 ms Ubuntu / 3.325 ms Windows for two files, not a whole attack-cost metric or performance certification.

This is intermediate negative evidence for the stipulated SNO full runtime-control threat model. It is not a bypass of cryptographic SHA-256 or a general proof for a trusted OS/TEE. User-facing root summary should not upgrade SNO integrity claims.

Other active work noted: Agent 39 and Agent 2 already have frozen multi-file app attacker-cost challenges; Agent 38 has multi-input and conditional Wasm lowering with seedless exact bytecode recovery and requested independent adversarial validation (broadcast commit `78ad4b1b`). Avoid redundant application fixtures or more cosmetic Wasm variants. Critic's 04:19 guidance prioritizes independent attacker cost and immutable integrated gates.

Continue productive research until measured 70min age; after checkpoints use the real clock, not subjective time. At release update this memory, push all useful state, then remove `agents/agent3/.lease.json` in the **final repository mutation** and confirm.

### 2026-11-16 05:08 UTC checkpoint: SCO graph-source publication guard

Found a separate legitimate SCO source-disclosure risk: `partitionScoAsyncGraph` returned `privatePaths` alongside its generated public RPC facades, but had **not attached** its known private paths to `clientFile.privateModulePaths`, which `createScoHandler` already understands as a fail-before-route denylist. An integrator accidentally adding an unexposed original dependency alongside the generated graph facades could therefore serve private source. This is complementary to Agent 36's `partitionScoSelectedAsyncExports` direct private-module audit, which already carries metadata.

Fixed `src/sco-graph.js`: each public facade now contains a separate shallow array copy of the graph's non-exposed private member paths. New `test/sco-graph-private-path-policy.test.js` checks each facade, both private-source orderings, empty-private graph, and real native HTTP **negative control**: deleting the provenance marker permits source-leak HTTP 200 and reveals a planted canary; retaining marker refuses handler construction. Updated existing manual `.github/workflows/manual-sco-graph.yml`, without adding any CI workflow.

**Validation pinned:** [Ubuntu+Windows run 43807583587](https://github.com/FlareZ123/obfs/actions/runs/43807583587), exact code commit `7b2753378555859b46112cce112a4906da735057`, 6/6 SCO graph tests on each OS and strict JSDoc pass, including existing private HMAC graph behaviour. A preliminary run [43807437020](https://github.com/FlareZ123/obfs/actions/runs/43807437020) succeeded at `5d0b1aa5495f0519770b8f752de36e80e6fff7c4` before the real HTTP negative control was added.

Report `im-results/sco-graph-publication-manifest-2026-11-16.md`. Updated example README `examples/sco-graph/README.md` and `docs/SCO_AUTHORIZATION.md`. Automatic guard is limited to already known private graph filenames; `publicPaths` still required for positive publication allowlist. No trusted-server compromise, abstract security theorem or whole-program 2.5x claim follows.

Continued research may focus on stronger source withholding with exact before/after graph, independent attackers and manageable hot/cold cost; avoid duplicating other agents' generated native Wasm and full-application attacker tests.

### 2026-11-16 05:12 UTC checkpoint: typed WebAssembly -0 correctness proof

Independently reviewed Agent 38's new 1–4-input conditional Wasm i32 grammar. Found exact soundness counterexample: `accepted()` allowed unary numeric literal `-0`; the Wasm i32 lowering coerced it to +0, even for return-only native `function f(a){return a?-0:0;}` called with canonical i32 input 1. JavaScript distinguishes -0 via Object.is and reciprocal. This violates 1:1 semantics despite declared numeric input contract; the output is a native JS Number.

Fixed `src/wasm-i32.js` with conservative `Object.is(-node.argument.value,-0)` exclusion for unary-minus literal zero. Added 4 negative cases (direct, both ternary orientations, nested ternary) and positive -1/int32 boundary conformance control in `test/wasm-i32-negative-zero.test.js`. Extended existing `.github/workflows/manual-wasm-i32.yml` to include case, no new workflow. Alerted Agent 38 in `communications/agent38/20261116T050715350Z_agent3_wasm-negative-zero.md`.

**Pinned** [Ubuntu/Windows full Wasm research+Chromium/CSP gate 43808274942](https://github.com/FlareZ123/obfs/actions/runs/43808274942), exact source `4fddecf80a605818e9e60b9764db1a7d81e7a282`, success; 27/27 Node tests on both OS, both strict typechecks, browser host/CSP gates on Ubuntu. Intermediate report `im-results/wasm-i32-negative-zero-2026-11-16.md`, updated `docs/SECURITY.md` which previously said only one Int32 argument (outdated). W3C spec confirms Wasm i32 has integer zero but no negative zero.

Future work: independently search for further boundary-preservation counterexamples, validate before patch. No additional static resistance claims; all Wasm bytes remain recoverable and cold initialization may exceed 2.5x. Preserve exact pinned CI and correct distinction between source native and Wasm result.
