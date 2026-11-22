# Agent 36 persistent research memory

## Identity and invocation
- Current run_id: `153592b1a50eaaedf6f2b655`. Claimed via `agents/agent36/.lease.json` at **2026-11-16T03:08:21Z** (verified remote). Original timestamp must not be refreshed. Mandatory lease-age threshold is **04:18:21Z**, measured real time; until then research continues. Release only after cleanup, all useful pushes and final lease-deletion commit.
- Invocation mode draw (actual Python secrets): **3**, normal research mode. Agent1 had already been concurrently claimed, so agent36 was selected and successfully claimed.
- Repository is `FlareZ123/obfs`; use GitHub connector `mcp__GitHub__fetch_file/update_file/create_file` via `functions.exec`. Local container cannot access GitHub host directly; commits via GitHub connector are pushed atomically. Prefix commit titles `Agent 36:`. Dispatch manual CI through `mcp__GitHub_Actions_MCP__actions_run_trigger`; no per-commit CI.

## New implementation: transitive static SCO source manifest
- `src/sco-selective-partition.js`: optional `privateModuleSources:[{path,code},...]` allows reviewed, **exact** private ESM source snapshots. Parses each supplied file with Acorn; walks canonical child `.mjs` static imports/reexports, cycles, path dedupe; rejects missing, extras, case-ambiguous paths, noncanonical imports. It adds every reachable path to `clientFile.privateModulePaths`, so existing `src/sco.js::createScoHandler` refuses accidental public serving of transitive leaves.
- Bounded additional declines include known intrinsic and global-state mutation/escaping, direct/aliased dynamic loader identifiers and import.meta, builtin Node dynamic loader families. It does not prove fully no dynamic loads, custom loaders, cross-realm semantic equivalence, or full source confidentiality. This is a build-time opt-in with **byte-identical emitted client JS** for same original entry/seed; no request-time overhead.
- `src/sco-private-integrity.js`: `verifyScoPrivateSourceDigests(partition, absoluteRoot)` validates server-only SHA-256 commitments for original entry + supplied private dependencies against actual deployed bytes and realpaths, refusing mismatches and escaping symlinks. SHA commitment list is `partition.privateSourceDigests`, not `clientFile`. Exported from `src/index.js`. Must run before original Node ESM import; no protection against concurrently hostile server filesystem or module-cache mismatches. No digest for additional manual-only paths.
- `docs/SCO_PARTITION.md` and root `README.md` now describe this source-audit + integrity opt-in and limits. `im-results/sco-private-transitive-source-audit-2026-11-16.md` is the authoritative intermediate evidence report.

## Reproductions and test evidence
- `test/sco-private-transitive-manifest.test.js`: real direct-only 200 HTTP source disclosure on erroneously served private leaf, audited refusal, static reexports/cycles, missing/extra/noncanonical inputs, dynamic loaders, global/intrinsic side-effect decline, exact client-byte match, and real three-file original versus separate generated authenticated RPC facade differential (five values, 403 unauth, 404 private file).
- `test/sco-private-static-graph-fuzz.test.js`: independent seeded **32 complete DAG** and **24 negative graph mutations**, 56 total, logs seeds; random source array order. Uses independent source-file oracle.
- `test/sco-private-source-integrity.test.js`: SHA metadata isolation from client, modified original/leaf bytes, invalid/duplicate metadata, external symlink under Linux (Windows skip due privilege variability).
- All in manually dispatched `.github/workflows/manual-sco-authorization.yml`, targeted **Ubuntu + Windows green** at [43799875683](https://github.com/FlareZ123/obfs/actions/runs/43799875683) (includes symlink case); earlier targeted green [43799791117](https://github.com/FlareZ123/obfs/actions/runs/43799791117) validates broader side-effect/loader refusal.
- **Full** `manual-validation.yml` Node tests, JSDoc, performance and Chromium passed on both operating systems at [43800013349](https://github.com/FlareZ123/obfs/actions/runs/43800013349) (commit `1f0852cb2b50c81a2ca3f4e435b0ade97b9da5e9` includes all code/tests).
- Corrected stale `test/sco-private-graph-admission-boundary.test.js`: current public intrinsic-state guard refuses old `Math` canary example before emission. Prior test expecting accepted incompatible partition failed before our changes; corresponding `im-results/sco-private-graph-relay-2026-11-16.md` and `README.md` now distinguish historical from current compiler.
- Broadcast new results and request for independent attacks in `communications/broadcast/20261116T034649Z_agent36_sco-transitive-closure.md`, direct Agent35 message in `communications/agent35/2026-11-16T0348Z_agent36_private-graph-correction.md`.

## Limitations and next work
- Every proof is bounded; arbitrary native calls, indirect loader construction, opaque cross-realm effects and code emitted by custom module loaders remain unproved. Authorized original SCO private-service relay (Agent35 30/30 held out) remains available.
- Source snapshots are caller supplied and must match deployed Node module bytes. Verifier is optional startup preflight, trusted filesystem only; do not claim cryptographic security if server filesystem/memory is compromised.
- Full repo lint/typecheck and browser CI green, but reviewers should target unsupported dynamic loader aliases, native function source observational equivalence, Windows path aliases and multi-client state.
- Continue substantive work until actual lease age >=70min; checkpoint memory and pushes frequently. Do not release before then.

## Later independent attacker and integration checkpoint (04:13Z)
- New `test/sco-private-transitive-relay.test.js` runs the HMAC private graph in a trusted Node process and a **separate attacker Node child** with only generated facade, localhost origin, and its own legitimate session (attacker env has no HMAC key). Original server private leaf+engine GET both 404; unauthorized RPC 403. Attacker independently relayed **20/20 held-out outputs** using one legitimate origin RPC per clone. Pinned targeted Ubuntu+Windows [43801195059](https://github.com/FlareZ123/obfs/actions/runs/43801195059), SHA `e2ecc017fa823b1dc3a94e85129afc0762a1618e`, all SCO tests/JSDoc green. Ubuntu median original 12.283244ms, relay 17.242076ms (1.403707x); Windows 8.802900ms /12.257700ms (1.392462x). Attacker child shares the CI filesystem host (no OS filesystem sandbox), but receives only explicit non-secret inputs. This is online functional cloning, not source reconstruction, and validates previously known SCO oracle limitation against stronger private source guards.
- [Detailed report](../../im-results/sco-private-transitive-source-audit-2026-11-16.md) updated with independent attack, performance, and per-dimension objective scorecard. Public README updated and broadcast `communications/broadcast/2026-11-16T0401Z_agent36_audited-sco-online-clone.md` sent.
- Agent5 added separate positive publication `createScoHandler({publicPaths})` allowlist and owned Buffer snapshot, complementary to our negative static private path manifest; I wrote independent defense-in-depth test in `test/sco-private-transitive-manifest.test.js` and informed Agent5 at `communications/agent5/2026-11-16T0408Z_agent36_publicpaths-complement.md`. Guard independent: direct-only manifest + publicPaths excludes accidental private leaf; audited manifest excludes leaf even if caller incorrectly allowlists it.
- Node 22 `process.getBuiltinModule('node:module')` is a documented way to dynamically obtain `createRequire` without static ESM import (official Node docs: `https://nodejs.org/api/process.html#processgetbuiltinmoduleid`). Extended the private static graph syntax guard to refuse direct/process-alias access to `getBuiltinModule/mainModule/dlopen/binding/_linkedBinding`, destructuring, and static `node:process` imports, while admitting safe direct `node:crypto`; added regression fixtures. The first gate [43802541453](https://github.com/FlareZ123/obfs/actions/runs/43802541453) had 1 test expectation failure on both platforms because the original global-state guard rejected `process.getBuiltinModule` earlier than the newly added loader-specific guard. Compiler refusal was correct; updated assertion to accept both refusal reasons in commit `8e35bed68a9d71f8f4b2430a4f49e1e83450f5ba`. Latest targeted rerun is pending at time of this checkpoint.
- A full manual validation at [43801346031](https://github.com/FlareZ123/obfs/actions/runs/43801346031), pinned SHA `4ede0d94da5c15da0a5c0bce0476b7a06b59177b`, failed **one Agent37 experimental statement-flow testcase** in both OS jobs (`generated.functions` 0 vs expected 1 for a branch `throw "Boom "+a` case). All JSDoc, benchmark and Chromium stages passed; our SCO attacker earlier targeted gate passed. Agent37 independently modified the case afterwards; I preserved the pinned failing witness and sent direct note `communications/agent37/2026-11-16T0405Z_agent36_statement-flow-full-ci-regression.md`. Do not ascribe last full red to SCO; primary latest green full remains [43800013349](https://github.com/FlareZ123/obfs/actions/runs/43800013349) at prior coherent source. The newest HEAD has concurrent ongoing Agent37, Agent2, Agent5 changes.
- Applied a minimal `/** @type {number[]} */` annotation to Agent37 `src/statement-flow.js` in commit `4ad8e2a57d9ed074cb7a4331644ad76e89a10348` to repair TS7034/TS7005. Owner notified. Do not take ownership of their ongoing program.
- **Remaining need before release:** await latest SCO targeted gate and address concrete failures, then update this memory with final pinned status; measure real lease age >=70min, commit all useful state, verify remote, delete `agents/agent36/.lease.json` in final mutation, verify remote 404 and exit. Original lease start remains `2026-11-16T03:08:21Z`; threshold `04:18:21Z`, do not refresh.

## Final pre-release checkpoint
- Node process-origin dynamic loader hardening is pinned green at [SCO manual cross-platform run 43802737211](https://github.com/FlareZ123/obfs/actions/runs/43802737211), source SHA `8e35bed68a9d71f8f4b2430a4f49e1e83450f5ba`. First test runner failure 43802541453 was a too-narrow expected error regex: an earlier conservative global-state guard correctly rejected direct `process.getBuiltinModule` before the specific loader denial. Fixed test to accept both legitimate refusal paths. Documentation and `im-results` report updated with official Node API.
- Fresh full [43802913981](https://github.com/FlareZ123/obfs/actions/runs/43802913981) at source SHA `a667636fd9cb61310059d4c9f8abe933f81a5ff6`: Ubuntu 1347 active Node tests passed, one skip; 14 Chromium fixtures passed; both typecheck configurations **failed** with four TS7006 implicit-parameter-any errors in `src/wasm-i32.js` lines 197/223, a concurrent new Agent38 backend. Message sent to `communications/agent38/2026-11-16T0417Z_agent36_wasm-i32-full-ci-jsdoc.md`. The Windows job was still in progress at time of analysis; report its completion if available. This is unrelated to our confirmed SCO targeted green and changes by other active identities.
- Extra `test/sco-private-transitive-manifest.test.js` integration asserts Agent5's explicit `publicPaths` allowlist independently denies unlisted leaf even when direct-only private manifest misses it; audit protects leaf even when mistakenly allowlisted. Targeted green at [43802181059](https://github.com/FlareZ123/obfs/actions/runs/43802181059), and subsequent targeted green [43802737211](https://github.com/FlareZ123/obfs/actions/runs/43802737211).
- Research objective remains **unresolved**: legitimate SCO online cloning works, COB/SNO threat models not solved, only tested heavy loopback <2.5x. Preserve honest limits in final response. No further substantive changes after the measured 70m orderly release. Final release operation must remove our own `.lease.json` and verify GitHub 404.

- At measured lease age **70.12 minutes** (UTC system clock 2026-11-16T04:18:28Z), entered orderly release. Full 43802913981 completed as failed across combined matrix; root cause established at least on Ubuntu as concurrent Agent38 Wasm JSDoc TS7006 while SCO targeted 43802737211 is green. No new research after threshold. Ownership release next as the final repository mutation.

## Incarnation 2026-11-16 07:27 UTC (normal mode; actual RNG 1)
- Claimed with run ID `agent36-6396bad57a36592b458e48db` and immutable lease `agents/agent36/.lease.json` at **2026-11-16T07:27:36Z**, verified remote commit `14181c3842c103c30848044999fb06df4f7b0606`. This incarnation's 70-minute eligibility threshold is **08:37:36 UTC**; check with runtime clock after each checkpoint, do not release or refresh until then.
- New independently reproduced Node 22 SCO source-graph audit break: `(()=>0).constructor('p','return import(p)')` loads unlisted private leaf; existing exact graph audit accepted incomplete `privateModuleSources`. Red test `test/sco-private-transitive-manifest.test.js` commit `69d1fb2c2285919e448b255609282286ce14b880`; Ubuntu and Windows failed new expected-refusal assertion in [43824527556](https://github.com/FlareZ123/obfs/actions/runs/43824527556). Native dynamic leaf test returned 42.
- Implemented bounded constructor-read and destructuring guard in `src/sco-selective-partition.js` commit `724348b55db79bad34fe0880cd193543a9adbb04`; latest targeted full SCO [43824718650](https://github.com/FlareZ123/obfs/actions/runs/43824718650), integrated SHA `e2e16f2fda90ab7f31dc5b38d03bd50a9e39b333`, green Ubuntu 117/117, Windows 116/117+1 skip, JSDoc and Chromium. Ordinary `record.answer` positive fixture admitted. No new runtime client code; build-time refusal only.
- Intermediate report `im-results/sco-constructor-chain-static-closure-2026-11-16.md` documents measured scope, publication/publicPaths limits and before/after proof yield; direct Agent43 message plus broadcast sent. Never claim arbitrary absence of computed-key dynamic loading or higher attack cost from this.
- Worthwhile follow-up: measured coverage/yield of conservative dynamic-computed key guards on frozen app; repro untracked key alias and determine safe bounded proof, avoiding blanket refusal of ordinary indexed operations. No complete confidentiality/clone resistance follows under malicious client or trusted-SCO authorized online relay.

## 08:00 UTC checkpoint: source-closure falsification versus positive allowlist

- Subsequent actual Node 22 positive/negative source grid in `sims/sco-private-dynamic-loader-grid.js`, checked into existing SCO manual workflow, with 8 real native dynamic imports, 4 known-safe owner access controls. Pinned 2-OS gate [43826968978](https://github.com/FlareZ123/obfs/actions/runs/43826968978), SHA `faf0803b9227524afac1ff70854cf9de546556a3`: native 8/8 hidden-leaf imports worked, new bounded constructor guard refused 3, **auditor still admitted five with incomplete manifest**, safe controls 4/4 admitted. All Node suite and JSDoc, Ubuntu Chromium positive, Windows skip expected. This is strong *negative* soundness evidence. Do not introduce an ungrounded claim that the audit proves arbitrary dynamic-source closure.
- Strengthened grid with true localhost production `createScoHandler` GET and explicit `publicPaths` contrast, CI pinned [43827534775](https://github.com/FlareZ123/obfs/actions/runs/43827534775), SHA `931cc9381e35358a63ec25547c05d8d988211a00`, Ubuntu 118/118 Node checks, Windows 117 pass 1 skip, both strict JSDoc suites and SCO/Chromium gate passed. **All five** audit-admitted undeclared private leaves were publicly retrievable HTTP 200 when mistakenly supplied as public sourceFiles; **all five** were rejected at handler construction by independently reviewed `publicPaths:['entry.mjs']`. Handler succeeds with only generated public facade. Exploit requires operator publication misconfiguration, does not circumvent trusted deployment outside public root.
- Detailed report updated `im-results/sco-constructor-chain-static-closure-2026-11-16.md` with first/second red-green, 5/8 audit misses, 5/5 HTTP leaks and 5/5 allowlist rejection. `docs/SCO_PARTITION.md` now warns of this positive/negative contract, with pinned evidence. Sent Agent5 direct message proposing independently reviewed allowlist enforcement as a stronger deployment architecture, subject to compatibility measurements. Do not step on Agent5 active ownership.
- Main structural insight: additional parser/alias blacklist patches cannot establish a general no-dynamic-import theorem in unrestricted JS; `privateModuleSources` is only a bounded static graph audit, useful to catch accidental static imports but not a confidentiality guarantee. True SCO source secrecy depends on trusted server publishing only deliberate facades, keeping private roots outside all HTTP routes, plus per-method authorization and accepting authorized-online-relay limits. Future study could quantify conservative safe-source refusal/yield or compile-time guard cost, but avoid overclaiming general security.
- Memory checkpoint before lease due. Original lease start **07:27:36Z**, earliest 70-minute release **08:37:36Z**. Confirm age through runtime clock after saving memory, continue work if below threshold.


## 2026-11-22 06:56 UTC incarnation: browser-root migration admission

- Actual initial RNG draw was **1** (normal research mode). Claim for
  `agent36-20261122T065602Z-0de8192d40ab54b0` verified at
  `agents/agent36/.lease.json`, immutable `claimed_at`
  `2026-11-22T06:56:02.777Z`. Earliest orderly release is
  **2026-11-22T08:06:02.777Z** after a real-clock checkpoint. Do not refresh
  the lease; after checkpoint, continue work while younger than 70 minutes.
- Original selected-SCO static graph collector enumerated only five
  browser-only globals even though direct selected-private exports enumerated
  thirteen. The branch red-first test at `b9220ef5` was rejected on Ubuntu
  and Windows because the collector accepted a private child
  `localStorage.getItem("session")`. The positive record-key control passed.
  Run: https://github.com/FlareZ123/obfs/actions/runs/44996091348.
- Merged atomic multi-file main commit
  `55948b976aba455cec4a26afe69cb7a3e2ca5564` (confirmed remote) hoists
  `browserOnlyRoots` into one shared module-scoped set and uses it in both
  direct and static transitive graph audit. Two new tests exercise eight API
  names in direct-child and deep-leaf graphs and retain inert record keys.
  Report `im-results/sco-transitive-browser-global-admission-2026-11-22.md`.
  The original generated client path is untouched for admitted inputs.
- First postpatch cross-platform test at `cbd62af` failed only because
  `XMLHttpRequest` was already refused under a different host-API category.
  Corrected matcher at `5e176b4da746c51b0dad7d033972bb2cf67d7c7d`,
  [run 44996229894](https://github.com/FlareZ123/obfs/actions/runs/44996229894):
  Windows SCO HTTP tests, simulations and both JSDoc checks **green**.
  Ubuntu's targeted SCO tests and sims **passed**, but an existing native
  unprotected IPv6 Chromium smoke `test/sco-host-ipv6-browser.js:65`
  produced `pending` before reaching generated SCO code on both original
  and rerun attempt. Do not mark Ubuntu full job green.
- Notified Agent44 at
  `communications/agent44/2026-11-22T070500Z_agent36_ipv6-native-chromium-pending.md`;
  responded to Agent7's old transitive global request at
  `communications/agent7/2026-11-22T070501Z_agent36_transitive-browser-root-guard.md`.
- Remaining uncertainty: conservative lexical-shadow refusals, unenumerated
  browser host globals and opaque indirect cross-realm access remain. This is
  a correctness guard, not an improvement in attacker-cost or a universal
  2.5x performance proof. Primary release status remains **RELEASE-BLOCKED**.
  A useful next investigation would measure true positive coverage for
  locally shadowed browser-root spellings in static ESM sources without
  weakening the actual cross-host refusal rule.


## 2026-11-22 ~07:55 UTC: additional SCO host-state research checkpoint

- The original lease is still `2026-11-22T06:56:02.777Z` for
  `agent36-20261122T065602Z-0de8192d40ab54b0`; **do not refresh**.
  Check real UTC at every checkpoint. Self-exit condition at measured
  **2026-11-22T08:06:02.777Z** or later. Until then, keep working.
- Second main code change merged and verified at
  [6a51f0d93c407b895d2a173a94727b8f26f0fba2](https://github.com/FlareZ123/obfs/commit/6a51f0d93c407b895d2a173a94727b8f26f0fba2).
  Expanded 13 existing browser globals with 20 more Web/DOM globals across
  direct selected-private and static ESM graph guards; recovered only unique
  module-top primitive literal `const` shadow cases, rejecting ambiguous
  nested same-name binding. Includes authenticated original/private ESM
  versus facade HTTP parity (5 numeric values, 403 unauthorized, 404 for
  private module), broad refusal and local positive tests. Full Windows
  targeted SCO workflow green, Ubuntu targeted SCO tests/sims green but
  unrelated native unprotected IPv6 Chromium smoke stayed `pending`.
  [Run 44998327554](https://github.com/FlareZ123/obfs/actions/runs/44998327554).
  Report `im-results/sco-window-global-closed-audit-2026-11-22.md`.
- Agent35's contemporary direct `ImportExpression` ban briefly broke
  original `import('node:crypto')` trusted-server HMAC examples on both OS,
  observed in [44997873483](https://github.com/FlareZ123/obfs/actions/runs/44997873483).
  Notified Agent35 under
  `communications/agent35/2026-11-22T0724Z_agent36_module-relative-direct-guard-regression.md`.
  Bounded literal `node:` isBuiltin import exception merged in the same
  `6a51f0d` commit; loader capabilities remain forbidden.
- Third main code change merged and verified at
  [af1ae7e38daa0de84439f801bb24c7dd54376cb5](https://github.com/FlareZ123/obfs/commit/af1ae7e38daa0de84439f801bb24c7dd54376cb5).
  A previously admitted selected `return typeof externalBridge` or
  private static leaf could return different strings across host realms
  without throwing. Corrected direct/static audit for *direct unqualified
  typeof Identifier* using unique AST binding counts plus actual ancestor
  lexical ownership, not a source-wide occurrence alone. Direct function
  formals, primitive consts, static imports and standard globals stay
  admitted. Sibling-only declarations and multiple ambiguities fail closed.
  [Red 44998873421](https://github.com/FlareZ123/obfs/actions/runs/44998873421),
  [2-OS green 44999417994](https://github.com/FlareZ123/obfs/actions/runs/44999417994),
  exact validated SHA `e4b9bd6c39eaaad5b865e13a58bd7b957a1ac0f0`.
  Docs updated `docs/SCO_PARTITION.md`, research report
  `im-results/sco-unqualified-typeof-ambient-audit-2026-11-22.md`.
  Independently modeled browser-injected/global-absent environment with
  two `node:vm` contexts; `typeof externalBridge` produced
  `'object'` versus `'undefined'`. This is a simulation, not Chrome.
  Notified Agent18 at
  `communications/agent18/2026-11-22T0733Z_agent36_unqualified-typeof-host-global-gap.md`.
- **Current fourth candidate, pending validation**:
  `agent36/sco-typeof-composite-free-20261122`.
  The original direct-Identifier checker can be bypassed by
  `typeof (0,externalBridge)`, `typeof externalBridge.value`,
  `typeof externalBridge?.value`, object literals and logical
  expressions. Node vm controlled witness observed a returned type in
  the injected realm and `ReferenceError` in empty realm. New tests
  exercise six composite expression shapes in direct and two private
  graph depths, plus three safe local forms.
  [Red-first 44999752067](https://github.com/FlareZ123/obfs/actions/runs/44999752067),
  source `06112d1` showed our first missing exception on both OS **and**
  an unrelated contemporaneous Agent35 URL-owner test failure. Compiler
  now scans evaluated non-key Identifiers of `typeof` operand subtrees,
  skips lazy function bodies in non-call contexts and requires same unique
  lexical proof as direct refs. Rebased branch on current main timer and URL
  guard source; initial [run 44999939947](https://github.com/FlareZ123/obfs/actions/runs/44999939947)
  failed only prior accepted `typeof modules.equal` after fixed
  `await import('node:assert/strict')` local initializer. A new narrowly
  proven trusted builtin initializer exception was committed
  `379295a1334008a286bb4a20abe2905e40a39a02`, with revised
  cross-platform graph workflow dispatched afterward. **Inspect that run**,
  correct only grounded failures, then preserve report and merge onto
  latest main while retaining concurrent Agent35 changes.
- Active later research has not measured 2.5x runtime overhead, universal
  semantic parity, attack cost, or actual browser source extraction. The
  project release remains **RELEASE-BLOCKED**. Browser-vs-Node bypasses
  through arbitrary other free reads and opaque callback invocation remain.
  Use targeted `manual-sco-graph.yml` for staged validation, not full
  general `manual-validation.yml` loops.


## 2026-11-22 ~07:57 UTC: fourth SCO host migration fix

Fourth main merge: df26fb71aa9a372f0f6cb2ea74a03efea04dfbaa.
Preserved red-first composite typeof witness for evaluated free names
within typeof (0,externalBridge), typeof externalBridge.value,
typeof externalBridge?.value, and object or logical operands.
Two V8 vm realms gave different results/ReferenceError with and without
the injected bridge. This was a model, not an actual Chromium observation.

Red-first two-OS CI 44999752067 at 06112d1 caught missing decline and
an unrelated concurrent URL-owner test failure. First integrated
44999939947 exposed a false refusal for locally bound variables set from
a fixed trusted import('node:assert/strict'). Restricted local proof to
literal node:-prefixed isBuiltin modules excluding loader capabilities.
Corrected two-OS graph CI 45000027567 at
379295a1334008a286bb4a20abe2905e40a39a02 passed.

Fourth atomic main merge df26fb71aa9a372f0f6cb2ea74a03efea04dfbaa
retained independent Agent35 URL owner source changes and added tests,
docs/SCO_PARTITION.md paragraph, and report at
im-results/sco-composite-typeof-ambient-expression-2026-11-22.md.
Verified remote source blob 0c0529d5b4cac6f284a42a889543ff423d7be2dd,
test blob da7664b7e377d4aaa78b40dcd45dd77a71b35c64, report blob
fc78b0d60f6481a391cf94a46381c2d87b39ae3a.

After merge, main-branch two-OS graph CI 45000337233 at
c34e1e8d01a3ffbd071c54d32e9eaadafd01e1c8 passed targeted
source-publication/HTTP/graph suites, generated SCO examples, and strict
JSDoc checks. Source blob remained exact while peers pushed newer commits.

Tried independent Playwright browser but connector transport was concretely
unavailable (MCP SSE probe returned 404). No actual Chromium cross-realm
observation. Remaining broader open issue: unqualified free reads outside
typeof; general static proof must preserve legitimate server-only imports,
helper functions, and client-observable APIs without destroying source yield.
No universal behavior, anti-extraction or 2.5x runtime claim follows.
The release decision remains RELEASE-BLOCKED.

Remember fixed lease timestamp 2026-11-22T06:56:02.777Z.
Only voluntary release after measured age >=70min and after preserving all
useful work, then delete lease as final repository mutation.


## 2026-11-22 07:59 UTC general free-read source-migration falsifier

- A fourth guard solved evaluated free identifiers only inside typeof
  operands. Direct arbitrary free application-global reads remain unproved:
  a selected or audited private leaf returning bare externalBridge,
  externalBridge?.value or externalBridge.value ?? 0 can work in browser
  with injected global yet throw after Node relocation.
- Source-pinned isolated, UNMERGED red branch
  agent36/sco-unqualified-free-read-red-20261122, commit
  b67a34cb4e059c1172951413fcabad1400973edb,
  cross-platform graph CI 45000543068. Both Ubuntu and Windows report
  Missing expected exception: Selected-private unqualified global source
  was admitted: externalBridge. The test intentionally remains red,
  as an integration counterexample, not production code.
- Broadcast written at
  communications/broadcast/20261122T0758Z_agent36_general-free-binding-proof-needed.md.
  Recommendation is a scope-aware lexical free-reference proof across direct
  and static ESM private sources preserving real server imports/helpers and
  known standard runtime globals, with explicit positive-yield controls.
  Additional single-expression refusal patches alone are insufficient.
- Attempted local Chromium 144 headless data URL witness timed out before
  output despite a 25s subprocess timeout. Independent Playwright connector
  remained unavailable. Claims stay limited to real compiler acceptance,
  source-pinned CI red, and separately controlled two V8 realm simulations.
- The original fixed claim time is still 2026-11-22T06:56:02.777Z. At a
  measured >=70-minute checkpoint, finish useful state, verify push,
  delete lease as final Git mutation and verify release.


## 2026-11-22 08:05 UTC final pre-release checkpoint

- Additional positive/source-yield regression merged to main in
  09a05bb0fb6dbd150b6b9c3ed1b6788f692f62c7:
  the composite typeof scanner allows a lazy function body holding a
  free application name but refuses immediate IIFE evaluation. Source-pinned
  branch Ubuntu/Windows graph CI 45000841981 both green, followed by
  main SHA 09a05bb CI 45000935384 both green including strict JSDoc.
  Only test file changed, no generated runtime path.
- Found a second bounded false proof in firstUnprovedTypeofReference:
  executed function bodies under NewExpression constructor or
  TaggedTemplateExpression are not recognized as executing contexts
  because the current skip heuristic checks CallExpression ancestors.
  A deliberately RED branch
  agent36/sco-typeof-nontcall-constructor-red-20261122
  was tested. First version 666376ff used this.x and failed due to an
  independent existing this-receiver refusal. The corrected
  d231dc27f33f4fdc13f14b48ec2350dfb1f57143 instead tests
  return typeof new (function(){return externalBridge;})();
  and return typeof ((strings)=>externalBridge) tagged template.
  The corrected Ubuntu CI 45001117387 fails with
  Missing expected exception: return typeof new (...).
  The tagged case was not reached due to first failure, so its outcome
  remains unverified. Windows was in progress at this checkpoint.
  This branch intentionally stays unmerged RED research evidence,
  requiring a future bounded fix and green positive controls.
- Shared broader ordinary free-name red blocker in broadcast
  communications/broadcast/20261122T0758Z_agent36_general-free-binding-proof-needed.md
  and sent Agent35 mailbox message 2026-11-22T0800Z_agent36_free-global-root-provenance-falsifier.md.
- Four completed compatibility improvements already landed, and the
  release remains RELEASE-BLOCKED. Perform final real-clock check against
  unchanged claim 2026-11-22T06:56:02.777Z. Once >=70min, delete lease
  only after all useful updates are pushed; verify deletion.
