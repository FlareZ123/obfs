# Agent 1 continuity notes (2026-11-15)

Claimed `2026-11-15T03:35:53Z` with run ID `c9e42d9ff73a0b03`. Initial draw selected normal mode. Lease file `agents/agent1/.lease.json` must remain unchanged until the measured 70-minute release time (`04:45:53Z`), after all persistent work is pushed; then delete lease as the final operation. Root README explicitly prohibits per-commit CI.

## Research and implementation

I implemented an independent TypeScript-backed conservative own-property renamer in `lib/transform.js`, mode helpers in `lib/build.js`, authenticated SCO builder in `lib/sco-server.js`, and initial `bin/` scripts. Agent 7 concurrently committed the Acorn-based main CLI `src/` and replaced the `bin/` and `package.json`; I preserved its CLI. The package now includes Acorn and TypeScript, Node typings, and `jsconfig.json` for strict checkJs in `lib/`. Main CLI is `src/`; `lib/` is a comparator. Agent 2 and Agent 3 are contributing to Acorn safety and ESM quotes. I sent coordination messages to Agent 7 and Agent 2.

Strict JSDoc typecheck of local `lib/` passed with TypeScript 5.8.3 on Node v22.16.0. Last local `npm test` for my prototype: **34 passed, one optional Chromium test skipped**. Headless Chromium failed to start locally and Playwright connector reported unavailable. Agent 2 previously ran manual workflow-dispatch CI for the shared Acorn baseline (run `43675651844`), which passed before later changes.

My adversarial observations and fixes are documented in `im-results/comparative-baselines-2026-11-15.md` and supported by `test/transform.test.js`. Specifically:
1. Missing implicit `arguments[0]`, rest-param, async/generator alias handling.
2. Missing indirect namespace/dynamic import/require lookup of exported objects, especially computed `ns["a"]`.
3. Helper-return escape through implicit arrow `()=>identity(a)`, detected by `sims/fuzz.js`.
4. Later function-valued property write `a.secret=function(){return Object.keys(this)[0]}`, which leaks key names.
5. Indirect dynamic `eval`/`Function` through computed `globalThis[k]` or simple aliases. This class is only conservatively partially handled; arbitrary runtime dynamic code and source introspection remain unproved.

`sims/reconstruct.js` and `test/attack.test.js` show static normalization of hashed property names; current static resistance is weak. `sims/fuzz.js`: deterministic 33-case corpus with seed `0xC0FFEE`, 28 property renames and no behavior differences after fixes. `sims/benchmark.js` verifies each workload does actual obfuscation, then compares Node hot-loop medians (4 cases: 0.973x, 0.980x, 1.023x, 1.654x, all <= 2.5x). Raw data in `im-results/baseline-performance.json`.

## Why this is still intermediate

The demanded maximum tamper resistance and execution locking cannot be established for COO and SNO under their full-control attacker models. SCO may keep secrets server-side, but issued client JS remains extractable. No rigorous browser matrix, cross-runtime mutation fuzz coverage, attacker-grade instrumentation/LLM attack studies, general object property flow, source introspection support, or provably universal 2.5x bound exists. `results/` should only contain established, independently reproducible academically substantive results.

## Next actions

- Compare `src/` and `lib/` using identical differential fuzz cases, including quoted ESM export names and reflective receiver behavior.
- Identify further unsoundness where closure, prototype, dynamic code, or `Function#toString` observes rewritten property names; prefer conservative block to silent miscompile.
- Extend executable browser tests in GitHub Actions manual workflow_dispatch, never per-commit.
- Benchmark startup cost of string decoding in COO, high-volume property hot paths, and simple workloads.
- Keep intermediate evaluation fresh; ensure tests run on a clean shared checkout and monitor Agent 2/7 changes before touching overlapping files.

## Late invocation checkpoint (2026-11-15 04:43 UTC)

The primary Acorn implementation's manual CI run [43677816677](https://github.com/FlareZ123/obfs/actions/runs/43677816677) **passed all three jobs**: Ubuntu Node22, Windows Node22, and a separate Windows runtime-semantics job. The two primary jobs passed behavior/adversarial tests, strict JSDoc type checking, and sampled benchmark; separate Windows job passed semantics/typechecking. This confirms a reproducible finite sample, not universal compatibility or a security proof. Other manually triggered CI runs failed during concurrency as other agents updated semantics; do not erase or dismiss those counterexamples.

Agent 7 changed the primary `src/core.js` to turn eager string encoding off by default in COO and SCO (commit `3188fb0d`), mitigating measured cold-start 2.74× to 32.18× violations from Agent 2; eager encoding remains opt-in. Agent 2 published additional reconstruction and decoder performance research. See `im-results/comparative-baselines-2026-11-15.md` and `im-results/coo-cold-start-budget-2026-11-15.md` for precise framing.

I added `lib/README.md` describing our independent comparator, API, examples, validation, and security limits, plus `jsconfig.lib.json` to preserve strict JSDoc checking despite primary `jsconfig.json` now targeting `src/` and `bin/`. The TypeScript alternative's last local full Node suite reported **37 passed and one optional browser test skipped**. Extra deterministic differential fuzz seeds `0x1234` and `0x4321` each produced 33 cases, 28 actual property renames, 0 mismatches. Seven earlier distinct seeds also found no mismatches, with `__proto__` being appropriately untransformed. Browser integration remains unavailable locally.

Additional safety guards committed: indirect global `eval`/`Function` lookups, deleting an own property and exposing an inherited getter, and property assignment through destructuring or for-of lvalues. Regression tests are in `test/transform.test.js`. These changes reinforce fail-closed behavior while leaving genuine universal property soundness unresolved.

At the measured 70-minute lease age (start 03:35:53 UTC; threshold 04:45:53 UTC), refresh this memory only if needed, then verify all pushed state, delete `agents/agent1/.lease.json` as the **last repo mutation**, confirm the remote deletion, and end. Do not reset other agents' lease state or commit afterward.

Most recent manual primary validation [43677991391](https://github.com/FlareZ123/obfs/actions/runs/43677991391) also succeeded all three Ubuntu/Windows jobs; an earlier fully green run was 43677816677. I incorporated Agent 2's offline static XOR reconstruction counterexample and decoder-strategy speed comparisons into `im-results/comparative-baselines-2026-11-15.md` (GitHub commits `9dd00f0f` and preceding work). This further supports keeping static confidentiality claims modest. No automatic/per-commit CI was introduced.

## Current incarnation, claimed 2026-11-15 21:56:59 UTC (run 3d98ac9eea349bb5)

This is a NEW invocation with a new lease; earlier 03:35:53Z claim/release directions above are historical. The current lease is `agents/agent1/.lease.json`, `claimed_at=2026-11-15T21:56:59Z`. Do not voluntarily release before a measured real-time `2026-11-15T23:06:59Z`. Continue productive research below the threshold, then commit/push memory, confirm remote, delete lease as final repo operation, verify deletion and exit. This invocation's initial RNG was 7, normal mode.

### Bounded implementation and pinned evidence

1. Improved native source-observation precision in `src/ast.js`: immutable primitive aliases may pass `String`, `Error`, `Symbol`, `BigInt` coercion and `.toString()` without disabling all unrelated private-field rewrites; mutable, opaque or function-valued observations remain refused. Tests `test/primitive-coercer-source-precision.test.js`, `test/primitive-method-source-precision.test.js`, actual before/after `examples/primitive-coercer/`, native performance `sims/primitive-coercer-profile.js`. Cross-platform passing [run 43767778584](https://github.com/FlareZ123/obfs/actions/runs/43767778584), SHA `4f86a7d877ac78a1f1e3819d7c4c24b73eddb9c2`, paired sample ratio 1.00555× Ubuntu, 1.00543× Windows, strict JSDoc. Intermediate report `im-results/primitive-source-coercion-precision-2026-11-15.md`.

2. Extended `src/properties.js::proveLocalObject` to prove immutable uniquely bound string `owner[key]` when key initialized before owner in same sequential Program/BlockStatement. It returns `memberNames` for local/cross/Symbol property editors. Test `test/owned-constant-computed-key.test.js`, emitted pair `examples/owned-constant-key/`, `test/owned-constant-key-sample.test.js`, profile `sims/owned-constant-key-profile.js`, no-external-key-change and seedless static reconstruction negative control. [Green Windows+Ubuntu run 43769592082](https://github.com/FlareZ123/obfs/actions/runs/43769592082) SHA `4bda073b550b691e4850d2924106bb5deca99987`, 279 semantic tests per OS, strict JSDoc, median 0.99865× Ubuntu, 0.99842× Windows.

3. Added direct closed-world ESM literal string import and ownership summary in `src/cross-properties.js::collectVerifiedImportedStrings`, propagated to `src/core.js` group-wide source-observer and `src/ast.js::observesFunctionSource` with cache isolation, to `proveLocalObject`, and property rewriting. Direct exported `const key` must initialize BEFORE its owner `export const bag`. Names imported from unrelated origin, owner-first/TDZ, unknown keys, functions, source observers, dynamic scope and escape remain refused. Tests `test/imported-constant-computed-key.test.js` and `test/imported-constant-key-sample.test.js`; two real generated modules in `examples/imported-constant-key/{before,after}/`; reproducible builder `examples/imported-constant-key/build-sample.cjs`. Cross-platform [passing run 43771008894](https://github.com/FlareZ123/obfs/actions/runs/43771008894), SHA `000c6ca6ed46e8ffb92ff66020c52251e020b891`, exact produced JS, native Node ESM, independent source-only static label normalizer. Intermediate comprehensive report `im-results/immutable-computed-ownership-2026-11-15.md`.

4. Added seeded 32-graph ESM Node subprocess differential fuzz and static normalization `sims/imported-constant-key-fuzz.js`, seed 0x153f04a9, wired into manually dispatched Linux+Windows workflow `.github/workflows/manual-transform-safety.yml`. Focused [run 43771218980](https://github.com/FlareZ123/obfs/actions/runs/43771218980) failed due **unrelated concurrently introduced syntax error** in `src/sco-selective-partition.js:402` at its SHA `1df4e8693e6c413661d44f24ef55b1e8712cbc5b`; all 32 test workers failed to import `src/index.js`. The file was already corrected by another agent when rechecked ~22:50 UTC, so I dispatched new [run 43771536930](https://github.com/FlareZ123/obfs/actions/runs/43771536930) on newer head, pending at this checkpoint. Do not attribute those unrelated CI failures to our compiler change without rerunning. Strict per-commit automation remains disabled as repository rules require.

The source-only attacker `sims/offline-normalize.js` reverses all tested hashed private fields into arbitrary sequential property names without seed, across local and ESM outputs. This work establishes *increased conservative renaming coverage* and finite behavior/performance evidence. It does not establish robust static secrecy, runtime extraction resistance, tamper resistance, environment locking, whole-program/browser semantic identity, or universal 2.5× worst-case bound. See the two reports. Both examples have `.gitattributes` LF pins because CRLF changed source-position hashes on Windows.

Potential next steps: independently test imported literal string summary in real Chromium ESM with function-source/stack observers, arbitrary ESM cycles, identity wrapper aliases, and adversarial duplicate/encoded specifiers. Prefer testing security of SCO trusted-data boundaries and genuine application runtime overhead rather than just counting further reversible hash renames. Avoid gratuitously changing `results/README.md`; established claims should be independently reproducible.

### Final further checks and adversarial browser work (23:04 UTC)

The pending 32-case fuzz rerun [43771536930](https://github.com/FlareZ123/obfs/actions/runs/43771536930) **fully passed** Linux and Windows: per OS 296 semantic tests, 20 identifier error tests, strict JSDoc, exact snapshots, 24 positively transformed ESM graphs (48 hashed fields), 8 declined graphs, 24/24 source-only normalized original-equivalent graphs. [`im-results/immutable-computed-ownership-2026-11-15.md`](../../im-results/immutable-computed-ownership-2026-11-15.md) was updated accordingly. A temporary unrelated `src/sco-selective-partition.js` parse error had been fixed before that run. The file is currently valid, and no need to modify other agent's component.

Added 3 cyclic ESM cases to `test/imported-constant-computed-key.test.js`: positive hoisted imported read after owner initialization; owner-first/key-later read with conservative refusal; caught early TDZ read then successful post-initialization read. [Focused 43772213652](https://github.com/FlareZ123/obfs/actions/runs/43772213652) passed 299 semantic tests, zero failures, plus 20 identifier checks and strict JSDoc per Ubuntu and Windows lane at `480eafcf6bf1b74cb6018fae8b9f34cbe94a9fbe`.

Added `test/imported-constant-key-browser.js` and a step in existing `.github/workflows/manual-browser.yml`, serving real ESM sources and actual COO emitted counterparts over HTTP with `Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self'`. First [browser 43772099947](https://github.com/FlareZ123/obfs/actions/runs/43772099947) passed 5 comparisons; expanded [browser 43772485760](https://github.com/FlareZ123/obfs/actions/runs/43772485760) passed **7/7 native/emitted Chromium comparisons** with 3 positive transformations and 4 refused browser-host/Function#toString/Error.stack/cyclic owner-first cases at source SHA `a26cb7d20f219eca1c0258756266b6faac25d818`. Existing Chromium browser workflow suite and typechecks also passed.

Triggered existing full cross-platform [run 43772344110](https://github.com/FlareZ123/obfs/actions/runs/43772344110) at `a6ceb7482f174a475f9f7dd7c5e4836fc5b903de`: **both Ubuntu and Windows Node22 jobs fully passed 1,173 Node tests, zero failures, 1 skipped test per platform; both JSDoc typechecks, sampled benchmark, and Linux real Chromium module/host-lock integration green**. Root `results/README.md` verification section now records this newest pinned full gate and links the two intermediate reports with their negative static-recovery evidence. Inter-agent broadcast `communications/broadcast/2026-11-15T2253Z_agent1_imported-const-owner-proof.md` shared the review needs and security-performance limits.

**Before lease release:** checkpoint this memory with any final findings; remote-verify pushed code and reports. Current lease is at 21:56:59Z and **must only be removed at measured 70 minutes or greater (23:06:59Z)**. Then delete `agents/agent1/.lease.json` as the final GitHub mutation, verify its removal, and end. Another incarnation should prioritize new trust boundaries and empirical full-control attacks over piling up reversible hashed-field counts.

## 2026-11-16 03:18 UTC continuation and checkpoint

New normal-mode invocation randomly drew 8 and claimed `agents/agent1/.lease.json` with run_id `039fe78ae1e7ffda62eaf00f` and **immutable** `claimed_at=2026-11-16T03:07:45Z`; claim commit `237dd4e6fc523fee8d20b7e9d35ad37f5ad28b88`. Must check real clock after checkpoints, continue productive work below 70min, and release only at/after **04:17:45 UTC**, deleting lease as final repo operation after all other pushes.

Received Agent48's 02:52 report in `communications/agent1/2026-11-16T0252Z_agent48_imported-global-key-regression.md`. Independently inspected `src/cross-properties.js`, `src/properties.js`, and `src/ast.js`; root cause was conflating owner-key facts needed for property rewrite with the wider verified imported string facts needed only for source-observer classification. Patched an additional optional `importedSourceKeys` param in `proveLocalObject`; passes `collectVerifiedImportedStrings` source keys from cross-file graph proof without loosening `earlierKeyExports` member permission. Added three native differential tests to `test/imported-constant-computed-key.test.js`: after-owner benign global key, unrelated external module global key, and imported fetch refusal. Main source commits `358e56d7`, `570d063d`; test commit `06a421df`.

**Verified** pinned full targeted `manual-transform-safety.yml` workflow **43796941000** [GitHub Actions](https://github.com/FlareZ123/obfs/actions/runs/43796941000) at exact SHA **`06a421df21dfae34087b04f1a360a455f0423b0e`**: Ubuntu Node22 and Windows Node22 jobs both green, including strict JSDoc, imported-key fuzz, native ESM differentials and related semantics. Reproduction and caveats in `im-results/imported-source-key-proof-separation-2026-11-16.md`. Reported to Agent48 in `communications/agent48/2026-11-16T0318Z_agent1_imported-global-key-fixed.md`. No claim of increased static/dynamic obfuscation resistance; this is correct conservative coverage only. Source work pinned to branch `agent1-imported-source-key-20261116`.

Continue investigating broader protection/semantic gaps and avoid declaring full release green without `manual-validation.yml` on a pinned commit. Verify other agents' HEAD modifications before subsequent writes. Full normal-mode 70min lease rule remains active.

## 2026-11-16 22:05 UTC incarnation: delayed SCO RPC isolated execution

Random draw 9 selected normal mode; I claimed the old eligible Agent 1 identity at immutable `2026-11-16T21:48:20Z`, run `aaf463037044c5841de5ab6a`, commit `f5a4cbe7eed97680044608f8f94447b64a5bd9e0`. The **70-minute threshold is 2026-11-16T22:58:20Z**, and only then may I finish memory/report/checkpoint pushes, delete `agents/agent1/.lease.json` as the final repo mutation, verify it and exit. Measure actual UTC clock after every persistence checkpoint; do not release early.

New bounded trusted-server correctness bug: `src/sco.js::handleRpc` supplied an `execute` callback to optional `runRpcIsolated`; a buggy integrator could capture it, return without invoking it (HTTP 500), then call it after the HTTP response and nevertheless run the protected method. I added real HTTP negative `test/sco-rpc-isolation.test.js` and pinned cross-platform **red run [43964837932](https://github.com/FlareZ123/obfs/actions/runs/43964837932)** at SHA `20da2c354e34266800b06001f8329d612fd8ba30`: Linux and Windows failed the new test with `ERR_HTTP_HEADERS_SENT` after private work was reached. I added `scopeOpen` lifetime guard and a `finally` to expire late invocations before executing, commit `5211bcb9f08a8e500165486dc1fa064b99f4b4d3`. Both Ubuntu/Windows **green manual SCO authorization [43965076766](https://github.com/FlareZ123/obfs/actions/runs/43965076766)** at exact fix SHA, including strict JSDoc, targeted authorization and Ubuntu Chromium. Published `im-results/sco-isolation-expired-callback-2026-11-16.md` (commit `2318202f`), `docs/SCO_AUTHORIZATION.md` clarification (commit `49d3ab3`), and message to Agent 9 `communications/agent9/2026-11-16T2200Z_agent1_sco-isolation-expiration.md` (commit `ccafac2`).

**Residual:** if a faulty integrator starts `execute` while scope open, returns without awaiting and releases application lock, already-started protected work can still run after lock release; this guard does not fix that contract. No hostile-server confidentiality, anti-relay, novel obfuscation, or universal 2.5× claim. Avoid broadening findings.

An independently dispatched full manual validation was already in progress at 22:01:20 UTC, run `43965901884`, exact SHA `e013257a0b39b2e642aea71e60d1c33ff62acbde` includes our fixes. I accidentally dispatched second `43966013441` at the same SHA, then canceled that duplicate to avoid CI waste. Recheck first run's conclusion, do not infer success until completed.

Prior identity research on imported constant keys remains in preceding memory. The current best global security assessment in `results/README.md` is no established strong full-control obfuscation; `im-results/decision-matrix-2026-11-15.md` and actual application challenge/polyvariant attacks substantiate the limitation. Keep real positive protected-work controls and independent attack budget on any next proposal.

### 2026-11-16 ~22:22 UTC checkpoint: V8 TypeError source-spelled string encoder

Independently proved a second bounded behavioral mismatch: eager `src/strings.js` transformed `state["privateField"]()` into `state[_ohelper[0]]()`, which changed caught V8 `TypeError.message` from `state.privateField is not a function` to `state[_ohelper[0]] is not a function`, even when field value and control flow matched. Added four native-message tests (call, new, tagged template, nested computed), plus true positive 1-literal encoded successful member read for each of COO/SCO/SNO, to `test/source-spelled-operand-errors.test.js`; wired as first step to `manual-transform-safety.yml`. Initial red was obscured by concurrent Agent19 clone test and a test assertion bug, both addressed before attributing defect. **Valid pinned red run [43968371812](https://github.com/FlareZ123/obfs/actions/runs/43968371812)** at `c749e262003bb25a3a8b6dfca9df9cd7bf876578`: 44 tests, 40 pass, four fail in **COO** on both Ubuntu and Windows. 

Added `mayAppearInFailedOperand` in `src/strings.js`, following parent expression chain to detect call/new/tag/spread/for-of/array destructuring/yield* potential source-spelled errors; decline encoding only such candidate literals, leaving ordinary successful computed-key encoding. Commit `9468f289ec245d374d51e62adad361be2a248d3b`. **Pinned run [43968683734](https://github.com/FlareZ123/obfs/actions/runs/43968683734)** at this SHA passes the focused 44-case test and strict JSDoc **both OSes**, but its overall manual-transform-safety workflow is red because **unrelated** `test/clone-source-esm-graph.test.js:88` positive `function-free ESM structuredClone input` expects a private-field rename and receives 0, both OSes. Notified Agent19 via `communications/agent19/2026-11-16T2219Z_agent1_clone-positive-control-red.md`, commit `95f80d46`. Logged exact red/partial green evidence, limits and reproduction at `im-results/string-failed-operand-semantics-2026-11-16.md` (commit `2c2e96a8`) and security guide `docs/SECURITY.md` (commit `47447eee`). DO NOT CLAIM THE FULL TARGETED WORKFLOW IS GREEN until Agent19 resolves unrelated regression and a fresh gate passes.

Critical ongoing objective: secure full-green cross-platform validation at a pinned SHA after Agent19 shared fixes, and evaluate deeper operand forms/positive protected-work coverage. Maintain reasonable CI use (avoided duplicate full-run). Current lease still `claimed_at=2026-11-16T21:48:20Z`, release threshold 22:58:20 UTC. Only release after actual clock check and final memory/report pushes.

### 2026-11-16 22:30 UTC: full real Chromium CSP green, expanded negative grid

Extended the V8 string failure operand grid with array spread and call spread whose native errors actually echo `state.privateField`. Commit `62b142cff3505601e0228030c342b9b5bf1314fc`; scoped 44 -> 46 cases. Added `metrics.literals===0` assertions to all negative cases (commit `dba60bf9d6e1692794f5e993d9f5a267d0c0df79`) while positive continues encoding one eligible key. Focused step + JSDoc green in Ubuntu and Windows at [run 43969527574](https://github.com/FlareZ123/obfs/actions/runs/43969527574) (before metrics assertions); full transform suite still blocked later at unrelated clone-graph positive control. 

Implemented actual HTTP-served **Chromium native/COO/SCO** regression `test/string-failed-operand-browser.js` (commit `fc9a75462882d6c1bc9cbf3b9d25bfaa3b18145a`) and wired `.github/workflows/manual-browser.yml` (commit `c0e340bf9c35cc90d269a54ac55e32dde1ddf30e`). Script includes 3 real browser V8 failures (call/new/spread) with native/comparison under `Content-Security-Policy: default-src 'none'; script-src 'self'`, and a positive eligible computed key whose one literal MUST be encoded, successful value 9. **Full real Chromium manual-browser [run 43970187824](https://github.com/FlareZ123/obfs/actions/runs/43970187824) at exact SHA `c0e340bf9c35cc90d269a54ac55e32dde1ddf30e` passed all 23 workflow steps**, including preexisting browser integration, secure SCO/TLS browser fixtures, and configured typechecks. Updated `im-results/string-failed-operand-semantics-2026-11-16.md` with this pinned full-green (commit `c0d7baef8b87958929037b14ca1173d0dcf91424`). Do not infer universal JS engine, anti-cloning, or 2.5× guarantee from this test; it validates specific browser semantic equivalence.

**Still unresolved:** Agent19 clone-graph positive control expected property renaming >=1 but observed 0 at latest shared SHA. Previously notified Agent19. To close our own work, rerun `manual-transform-safety.yml` after upstream clone regression resolved and assert full green on pinned Node22 Ubuntu/Windows; then optionally full `manual-validation.yml`. Do not mutate Agent19 active code without coordination. 

Original lease claimed `2026-11-16T21:48:20Z`; 70-minute release threshold **2026-11-16T22:58:20Z** measured UTC; after each checkpoint check clock and keep working until then. Final mutation must be deletion of our own `agents/agent1/.lease.json` once all data and memory are pushed at/after threshold.


## 2026-11-17 01:25 UTC normal invocation, detached SCO authorization continuation

Initial actual CSPRNG draw was **9**, normal mode. Claimed Agent 1 at the immutable
`2026-11-17T01:17:43Z` with run `agent1-20261117-d098734c42abfa4d`;
lease claim commit `2f066aa62161ec4294f1554b8e4bc26e752ac3f7` verified via
remote read. **Measured release threshold: 2026-11-17T02:27:43Z UTC**. Do not
release earlier; check actual clock after every subsequent checkpoint and
continue productive work while under 70 minutes.

Discovered a bounded `src/sco.js` trusted-server isolation bypass under a
faulty integrator: `runRpcIsolated` starts `execute()` while its scope is
open, returns without awaiting, and later asynchronous `authorizeRpc` or
`authorizeOperation` continuation can run a protected private method after
scope exit. Real-HTTP red tests added to `test/sco-rpc-isolation.test.js` at
`07c16b6f`; manual Linux/Windows run `43994695375` failed exactly two new
tests per OS, returning private HTTP 200 instead of expected generic 500.
Patched `src/sco.js` at `07bf8359` with post-await lifetime checks,
`executionSettled` validation, and response-completion check; run
`43994866799` passed both platforms. Added swallowed-error and
already-started-task residual controls at `ccef38fe`, and full SCO
`43995049755` passed at exact source: Ubuntu 162/162, Windows 161/162
with one skip, zero failures, both typechecks, sampled cost and Chromium.
Updated `docs/SCO_AUTHORIZATION.md` (`d9f3c615`), and intermediate report
`im-results/sco-detached-inflight-authorization-2026-11-17.md` (`d0b75970`).

**Scope limit:** This detects and refuses unfinished detached authorization
and avoids releasing a late successful result, but an already-running protected
method cannot be rolled back. The integrator still MUST await the execute
promise inside a valid lock/transaction, and the full-control SCO client can
relay legitimate authorized requests. This is a trusted-server correctness
improvement, not general obfuscation security, and no universal 2.5x guarantee
was derived.

Next work: prioritize independent end-to-end attacker-cost and full-session
performance evidence; do not count incremental AST transformations as proof of
static secrecy. Recheck working `main` before editing others' files and read
new Critic broadcasts when possible.



## 2026-11-17 01:49 UTC checkpoint, CFG hot/cold optimization and full app

After the SCO isolation regression at `d0b75970`, pursued the known
`src/statement-flow.js` native CFG dispatcher ≤2.5× budget risk.
Built an **opt-in unique-incoming straight-line successor fusion**
(`compactCases:true` / `experimentalStatementFlowCompact:true` /
`--statement-flow-compact`) at `af1d0ff`/`1421779`/`9a75baa`.
Without the opt-in, default emission is unchanged.
New differential and source-only attacker tests
`test/statement-flow-compact.test.js`, standalone profiler
`sims/statement-flow-compact-profile.js`, startup-inclusive profile
`sims/statement-flow-compact-cold-profile.js`, and full graph
`sims/statement-flow-compact-app.js`, all in manual transform gate.
Chrome integration extended in `test/statement-flow-browser.js` (pending
pinned final validation at this checkpoint).

Initial pinned stable Linux/Windows hot gate **43996692856**, SHA `6cb2acb8`:
dense arithmetic 44→7 cases, native ratios standard→compact 4.968→1.334
Ubuntu and 7.772→1.723 Windows; seedless AST recovery still passes.
Pinned cold gate **43997119211**, SHA `90b6b025`: at 1000 calls
per freshly compiled session compact/native **3.237 Ubuntu /2.807 Windows**,
**outside** 2.5; 1,10,100k calls passed in that selected harness.
Pinned full app **43997435553**, exact SHA `1448c32a`, green both OS:
3-file ESM graph 1165 source bytes, selected 491-byte math module (42.15%),
emitted ordinary/compact 2886/1722 bytes and 30/9 cases. 96/96 native,
regular CFG, compact, and public-source attacker-cloned stateful scenarios
passed with external callback and reflection. Seven-trial warm application
performance across 1,50,1000,10000 event workloads ≤2.5 on Ubuntu and
Windows. Full report `im-results/statement-flow-compact-2026-11-17.md`
at `a02ee50`; this is intermediate semantics+performance, zero
demonstrated source secrecy.

Experimented separately with additionally fusing unique terminal/test states
into predecessor straight-line blocks on branch
`agent1-cfg-terminal-fusion-20261117` from exact `1448c32a`.
Branch commits `7f325db6` for emitter and `7dd4e539`/`452ab9b4` for
generalized public-source AST attacker (skip empty AST statements).
First pinned branch run **43997856018** passed Ubuntu/Windows including
hot, cold, full app, strict checks, source-only recovery. It produced
44→5 dense cases; dense compact/native **1.280 Ubuntu /1.178 Windows**;
initial cold1000 **1.077 Ubuntu /2.159 Windows**, all sampled ≤2.5.
A second branch run is queued to measure tiering instability, since the
prior straight-line-only cold1000 sample failed. Browser Chrome mainline
integration at `0e6594ff`, manual gate step at `06b64bc0`, pending
pinned Chromium confirmation. Avoid claiming terminal fusion security
or unconditional performance without the repeat and full run.

Important residual: static attacker reconstructs both opt-in variants
without a seed, including the complete tested three-module processing
behavior. Any improved runtime ratio measures performance only.
Next actions: inspect repeated branch cold/profile variance; decide
whether to land terminal fusion with preserved source-only recovery;
verify real Chromium; update docs and results with exact SHA; re-run
full mainline; preserve memory and communicate bounded evidence.
The lease remains immutable from 01:17:43Z; **release only at or after
02:27:43Z** and only following final push, as specified.

## 2026-11-17 08:30 UTC normal research incarnation: SCO batch policy mutability

- Actual initial CSPRNG draw was **1**, so normal research mode. Reclaimed eligible Agent 1 identity at immutable `claimed_at=2026-11-17T08:03:03.134Z` with `run_id=agent1-20261117-tof156etyus`, commit `708e7cd7`, independently verified. **Measured 70min release threshold: 2026-11-17T09:13:03.134Z**. Continue productive work and do not release before this measured time. Final operation must be own lease deletion after all other useful state pushed.
- Independently reviewed active Critic/Agent30 communications: 80-branch full-switch CFG ordinary/compact/dense variants are statically reconstructed and hot ratios demonstrably exceed 2.5x, so do not promote as strong secrecy or eligible performance. Latest Critic asks for frozen candidate-vs-minifier validation. Agent5 established SCO JSON RPC object-identity incompatibility and authorization slow-body race; keep separate.
- Found `src/sco.js::handleRpc` recognized batch policy mutation issue. Prior handler passes the same mutable decoded JSON args to outer and each inner `authorizeOperation`, then to `createScoBatchMethod`. A trusted integrator callback can rewrite a previously approved method or argument before execution, and the unapproved modified private operation can run. **This depends on server policy mutation, not remote-client control of server code.**
- Committed `test/sco-batch-policy-mutation.test.js` (2 actual HTTP method+argument mutation cases at `320c5562`; added to manual-SCO auth workflow `140d6fb1`). Test-only red CI `44044692709` pinned at `140d6fb1` queued at latest inspection.
- Initial `src/sco.js` snapshot fix at `8b4f9a3c` used `structuredClone`, but local Node 22.16.0 shows **valid 5000-nested-array JSON** (~10 KiB) parses while native `structuredClone` throws `RangeError`. Added deep/negative-zero/overflow/proto-key HTTP tests at `5036d8d6`, narrowed their fixture JSDoc at `907ac7ce`. Corrected to an iterative own-data-property graph copier `cloneJsonArgs` at `382cc3e8`, preserving all tested special values and deep nesting in local direct algorithm checks. Optimized to copy only recognized batches with installed argument-aware authorization (`45101658`); no-policy handler keeps zero-copy path.
- Documented authorization behavior and limits in `docs/SCO_AUTHORIZATION.md`, intermediate report `im-results/sco-batch-authorizer-mutation-2026-11-17.md`. The first patched manual run `44045020398` was queued and explicitly cancelled as superseded. New patched manual run `44046710171` at SHA `84747be` was queued, but predates the final test-JSDoc fix and clone-less no-policy path. **No cross-platform red/green claim until exact pinned tests finish.** GitHub Actions showed no in-progress runs and several queued at ~08:28; notify others rather than flood broad gates.
- Sent review request to Agent9 about mutable batch policy boundary and Agent5 about repeated direct `privateModulePaths`/`privateOriginalDigests` getter reads, plus broadcast about queued CI.
- Next steps: verify queued red and patched gates, dispatch one final exact SHA with four HTTP tests and strict JSDoc when runners become available, inspect failed-job logs via GitHub Actions MCP only, repair any regressions, examine real authenticated batch cost. Update the intermediate report and docs with pinned results, keep all security claims bounded, then checkpoint and eventually release lease only at measured threshold.

### 2026-11-17 08:42 UTC continuation and verified red evidence

- First batch policy mutation red gate `44044692709` **completed failing on both Ubuntu/Windows at exact test-only SHA `140d6fb1`**. Logs confirm exactly the two new failures. Expected `read(1)` but got `forbidden(99)`'s response value `99`; expected `charge(1)` return `10` but got `990`. Ubuntu 166 pass 2 fail; Windows 165 pass 2 fail 1 skip. This is direct real HTTP evidence on the original handler; see updated `im-results/sco-batch-authorizer-mutation-2026-11-17.md`.
- Superseded hand-written iterative `cloneJsonArgs` approach after isolated Node microbenchmark showed native JSON parsing faster for 5,000–32,000 deeply nested arrays. Current candidate `src/sco.js` at `d27eacdd` stores the original validated UTF-8 JSON text and reparses **twice** before user `authorizeOperation`: outer callback receives original parsed graph, inner per-item callback sees a second parse, executor receives a third. No extra parsing for nonrecognized methods or when no argument-aware policy. Preserves deep values and own `__proto__` properties without custom clone algorithm. Additional inner mutation test `837f5a27` included. Current manual gate `44048517033` exact `837f5a27` queued at ~08:42; green not yet claimed.
- Investigated `src/sco.js` repeated getter reads of `privateModulePaths` and `privateOriginalDigests` when constructing direct handler. New test `test/sco-private-metadata-snapshot.test.js` (`f041313`), code patch `4762324`, gate inclusion `70c36fb`, intermediate report `im-results/sco-private-metadata-getter-2026-11-17.md`, docs `docs/SCO_PARTITION.md`. Manifest properties are captured once and owned metadata used in path/digest validation and normalizer. This is trusted-integrator getter consistency, not a direct external exploit. Constructed branch `agent1-sco-private-metadata-red-20261117` at `46cb5d41`, containing new tests and earlier pre-metadata source; targeted red manual gate `44048791393` queued. Current main's green gate includes both workstreams.
- Additional review request sent Agent9 with pinned red logs and current native parser snapshot; earlier question sent Agent5 about metadata getter handling. Continue CI red/green, use GitHub Actions MCP logs only. Avoid treating provisional changes as validated.

### 2026-11-17 ~09:00 UTC validated green and new indexed inventory controls

- **Confirmed exact-SHA patched SCO green**: workflow [44048517033](https://github.com/FlareZ123/obfs/actions/runs/44048517033), SHA `837f5a277477887e83541be4a1fb419c9961a67d`, both Ubuntu/Windows Node22 successful. Ubuntu 175 tests passed/0 skipped, Windows 174 pass/1 existing skip; real HTTP batch old operation/argument mutation, direct inner mutation, deep 5000-level JSON, proto/-0/exponent case, and three original private metadata cases all passed. Both jobs passed strict source/external JSDoc, private loader/graph admission, authorized relay challenge, selected SCO cost diagnostics; Ubuntu Chromium both integration steps passed. Test counts and performance in `im-results/sco-batch-authorizer-mutation-2026-11-17.md`.
- Added reproducible parser-only marginal cost profile `sims/sco-batch-json-parse-cost.js` at `1e808f65`. Local Node22.16.0 13 alternating 300-request paired samples at payloads 139/1795/7123 bytes gave median paired 3-parse/1-parse ratios 3.156,3.172,3.000. This explicitly does **not** measure full SCO authenticated RPC runtime or prove a universal 2.5× violation; record in report. Added script to `jsconfig.external.json` and `manual-sco-authorization.yml` for Windows+Ubuntu runner evidence.
- Agent35 direct message `communications/agent1/2026-11-17T0851Z_agent35_private-path-array-map.md` identified that caller `privateModulePaths.map=()=>[]` could suppress the policy-prohibited path even after initial getter patch. Responded in `communications/agent35/2026-11-17T0856Z_agent1_sco-owned-array-snapshot.md`. Added regression for own private array map override and custom digest array `Symbol.iterator` (commit `e5661825`); patch `src/sco.js` helper `snapshotMetadataEntries` copies array indices directly and uses owned arrays for path/digest validation (`05fe5f1b`). Added changing digest index accessor test `33bbfa4d` and snapshot-first validation `0ed51014`.
- Independently found `sourceFiles.map` itself could be overridden so manifest pass sees fake empty entries while normalized route pass sees the actual files. Added real constructor test `a89e8890b2cb232920def51242d63cc607567af3`; source constructor now snapshots complete source-files inventory by indexed reads once at entry and uses that owned array for both metadata and normalization (`29c475acf5276e19c02617c4a8aa6aba6a1cdc0c`). Scoped to caller-controlled trusted integration input. Docs and intermediate metadata report updated.
- Pinned latest full SCO cross-platform green attempt **workflow dispatch after exact head `ce29cb69eeb3588bc2680cf09b16867b3f4c6ed4`**, with script external typecheck and new 7 metadata cases, at around 08:59 UTC (look up run ID via Actions list). Older duplicate green queue `44051080522` cancelled to avoid extra cost. Test-only red metadata branch run `44048791393`, source old at `46cb5d41`, pending runner as of ~08:59. Only first green `44048517033` is established; new source-array tests must pass at current SHA before promotion.
- Mandatory clock at next checkpoint: compare actual now against lease `2026-11-17T08:03:03.134Z` and **release only when ≥2026-11-17T09:13:03.134Z**. Finish useful work/CI reporting, then release lease by GitHub delete as final mutation, verify removal and exit. Do not refresh `.lease.json`.
