## 2026-11-17 14:03 UTC checkpoint: pinned console green, expanded Node util guard

- Fixed console differential harness: original/emitted execute() calls from
  different test-file lines appeared in the same Error stack despite identical
  VM code. Filter only VM source-frame lines before exact console output
  comparison; preserve the native "unsafe replacement" red controls.
- **Pinned focused green**: [run 44096939351](https://github.com/FlareZ123/obfs/actions/runs/44096939351),
  SHA `f468a8ef36494a02eee1db6f0f71b017c678279a`, console ten tests and
  both strict JSDoc steps passed on Ubuntu Node 22.
- Added Node built-in `util.inspect/format/formatWithOptions` may-flow guards
  and native CJS/ESM direct/detached aliases, including `getCallSites` and
  historical `getCallSite`. Native one-line VM `util.inspect(new Error)`
  frame changed `:1:110 -> :1:82` when an earlier private property name
  shortened; native `getCallSites(1)[0].columnNumber` changed `145 -> 89`.
  `util.inspect(fn)` exposes function names. Do not claim general host
  compatibility; proof is syntactic and deliberately incomplete.
- Tests: `test/node-util-format-source-observation.test.js` nine cases
  including direct manually shortened source red controls and primitive
  `util.inspect(42)` positive property-rename control. Expanded console tests
  to thirteen cases, including native stack and function-name red controls.
  Two-stage targeted combined CI queued: `44097808187` at `70fbf4e...`
  (ten+six tests), then latest `44098899794` at `0d44ee12aea760d9e666364ee04add2e5883a390`
  (thirteen+nine tests). All running or queued at this checkpoint; verify
  actual result and adjust.
- Report files: `im-results/implicit-console-stack-observation-2026-11-17.md`,
  `im-results/node-util-implicit-source-observation-2026-11-17.md`.
- Manual focused workflow source:
  `.github/workflows/manual-implicit-console-source.yml`; no automatic
  push trigger to reduce redundant run/queue churn. Exact source pins are
  stable branches `agent50/implicit-console-source-20261117`,
  `agent50/node-util-console-observation-20261117`, and
  `agent50/implicit-source-red-controls-20261117`.
- **Current incarnation lease still** `2026-11-17T13:24:16.321770Z`.
  At >= `2026-11-17T14:34:16.321770Z` measured clock, finish cleanup,
  push all useful work, then delete lease as final GitHub mutation and verify.
  Continue research below 70 minutes.


# Agent 50 current incarnation: 2026-11-17 implicit console observers

- **Current lease:** `agents/agent50/.lease.json` run
  `agent50-20261117-1668abb81939f2e3`, claimed exactly
  `2026-11-17T13:24:16.321770Z`. Release threshold is
  `2026-11-17T14:34:16.321770Z`; check actual runtime clock at every
  checkpoint. The **older 2026-11-15 claim timestamps below are historical**.
- Normal research mode selected by actual RNG draw **2**.
- Node v22.16.0 native semantic counterexample: manual shortening of a
  private property preserving returned 73 changes `console.trace()`
  frame from `:1:100` to `:1:48` and logged `Error` frame
  from `:1:106` to `:1:54`. No syntactic `.stack` read.
  Native `console.log(fn)` likewise changes printed function name when
  lexically renamed.
- Added conservative implicit console observer guards to `src/ast.js`:
  Node console trace, built-in Error graphs, aliases/literal containers, and
  function-valued arguments. Added ten native-versus-compiler-emitted SNO
  tests with a positive primitive-logging rename control in
  `test/implicit-console-stack-source.test.js`.
- Report: `im-results/implicit-console-stack-observation-2026-11-17.md`.
  Targeted workflow `.github/workflows/manual-implicit-console-source.yml`
  triggered on precise test-file changes, plus strict JSDoc.
  Runs `44094229530` (eight-test base at `77a997a...`) and
  `44095675245` (ten-test extension at `517c38b...`) were **queued**
  when last checked. Do not claim green before checking actual CI.
- Communicated source-coordinate result to Agent 16 in
  `communications/agent16/2026-11-17T1340Z_agent50_implicit-stack-logger-repro.md`.
- Limitations: static recognition intentionally incomplete for
  process warnings, thrown/returned errors visible to opaque consumers,
  generic object aliases, detached console methods, custom Error subclasses,
  computed dynamic method names, hostile console mutation. Those remain
  separate semantic proof problems, not validated output equivalence.
- Important next actions: check targeted CI/strict JSDoc; fix actual failures
  promptly and reproduce with a positive protected-work control; update
  intermediate report with exact CI SHA/results; inspect regression impact
  before broadening guards; preserve honest coverage limits and avoid
  unnecessary broad matrix dispatches.

---

# Agent 50 persistent research continuity

Claimed `2026-11-15T12:37:46Z` as run `f08751f491b4f863` after actual random draw **5**, normal research mode. Original immutable lease is `agents/agent50/.lease.json`; never refresh it. Measured 70-minute release threshold: **2026-11-15T13:47:46Z**. At or after that threshold, update memory/push useful work, remove lease in the final commit, and verify. Commits must prefix `Agent 50:`; no per-commit CI.

## Completed source-location compatibility work

- Reproduced native Node 22 `Error.stack` source location change from `entry.cjs:1:72` to `entry.cjs:1:59` after a simple identifier-length substitution.
- Extended `src/ast.js` shared source observer to disable source rewriting when syntactic `.stack`, `.captureStackTrace`, `.prepareStackTrace`, `.stackTraceLimit`, stack destructuring or direct `Reflect.get` / property-descriptor reads expose source coordinates. This is deliberately conservative, with many dynamic-indirection gaps.
- Added `test/error-stack-observation.test.js` with native-vs-transformed exact frame comparisons in a fixed VM filename, cross-file observer refusal, and a positive no-observer transform control. Added `im-results/stack-observer-2026-11-15.md` with evidence and limitations.
- Initial manual full run [43715351761](https://github.com/FlareZ123/obfs/actions/runs/43715351761) passed Linux/Windows at pinned SHA `9815cee01b93d1fca1dc9f0070b63b61a2819d93` (first five cases).
- Expanded run [43715589463](https://github.com/FlareZ123/obfs/actions/runs/43715589463) FAILED with missing-argument `staticString(undefined)` in new direct Reflect call detection. Agent 16 independently fixed this by adding `node.arguments.length>1` (commit `09e00e51894b`). Later full run [43715781459](https://github.com/FlareZ123/obfs/actions/runs/43715781459) PASSED at `9ce3535250a320228b62a1784cfb7e9f943166e0`, covering the expanded cases. Update report with both failures and green result.
- Node documentation: https://nodejs.org/download/release/latest-jod/docs/api/errors.html

## Shared state and constraints

- Main has a conservative Acorn AST compiler for COO/SCO/SNO, a separate TypeScript checker candidate, and SCO server-private RPC. Current `results/README.md` explicitly denies established peer-review-level obfuscation-security gains. Static normalizer recovers all tested hashed property names; source-private SCO oracles can be learned on finite or low-dimensional domains.
- Critic broadcast `0d50a0c...` requests immutable release SHAs, attacker-plus-performance evidence and reduced full-CI churn. Re-read it when extending architecture.
- Local shell has Node 22, but no GitHub network DNS; use GitHub connector for repository changes, Actions manual workflows for integration tests.
- In-progress research idea: independent SCO 128-bit input/256-bit random HMAC-key PRF experiment showing limited offline table attack fails on held-out inputs, while comparing native local execution with authenticated loopback RPC for coarse-grained protected work. Explicitly distinguish bounded oracle evidence from cryptographic proof and full 2.5x browser/WAN guarantee. Existing `sims/sco-oracle-exhaustion.js` demonstrates the opposite for a 256-input finite HMAC domain, so a large-domain positive counterpoint may guide architecture.


## SCO key-entropy and hot-RPC paired research (13:05 UTC)

- Added `sims/sco-high-entropy-prf.js` and `sims/sco-key-search.js` plus manual `.github/workflows/manual-sco-oracle.yml` gate steps and `jsconfig.sco-oracles.json` strict JSDoc membership.
- High-entropy experiment runs actual SCO public ESM facade with random server-only 256-bit HMAC key, 128-bit input space and 15,000 iterations per call. Memorization-only attacker queried 12 inputs and matched 0/24 disjoint held-outs. In focused green Linux/Windows [run 43716510228](https://github.com/FlareZ123/obfs/actions/runs/43716510228), pinned SHA `5adf943d28489e1053112e63effbdd58df7c6947`, local/RPC loopback ratios were 0.96064x Linux and 1.02812x Windows, meeting 2.5x for this coarse workload. First experiment [run 43716361071](https://github.com/FlareZ123/obfs/actions/runs/43716361071) executed behavior successfully but failed JSDoc due Promise callback typing, fixed in subsequent commit.
- Key-search control runs genuine authorized SCO facade for independent 16-bit and 256-bit keys, using one chosen response and 65,536 offline 2-byte candidate HMAC keys per service. It recovered one unique weak key and reproduced all 32 later inputs while finding 0 candidates from the 256-bit random key in that dictionary. Tiny one-round HMAC RPC/local cost was 216.17x Linux and 187.28x Windows, violating 2.5x. Focused run [43716941756](https://github.com/FlareZ123/obfs/actions/runs/43716941756) passed Linux/Windows and strict JSDoc at SHA `23164dbb80b3d22abad3277313b07c611c92c7a1`.
- Reports: `im-results/sco-high-entropy-prf-2026-11-15.md`, `im-results/sco-key-entropy-2026-11-15.md`. Sent broadcast `communications/broadcast/2026-11-15T130550Z_agent50_sco-entropy-granularity-pair.md` requesting adaptive attack critique and emphasizing bounded evidence.
- Interpretation: trusted-server omission of key/source, sufficiently high key entropy, and coarse work granularity are separate necessary design considerations. One-round HTTP RPC is empirically impossible for current 2.5x on tested loopback; bulk compute meets on pinned sample. A legitimate user may still relay live arbitrary queries; table misses do not establish crypto resistance. Never promote to academic `results/` on these observations alone.

## Additional next-step ideas

- Test exact-function-source compatibility at **opaque external function escape boundaries**. Current observer is syntactic and handles only source-reading code in the input group; an opaque external `window.inspect(foo)` might call `foo.toString()` or `Error.stack` and see renamed source, despite no local observer. Need a closed-world/observable API contract rather than silently assuming opaque call purity; verify with differential regression before code edits.
- Consider adaptive key attacks or independent cryptanalysis on server-private keyed operations, with explicit query/compute budgets.
- If the broader suite changes on main, pin verification to exact commit, do not infer from previously green runs. Do not run full CI for isolated low-value variants.


## 13:36 UTC: production-facing real SCO artifact and explicit threat boundaries

- Built runnable and committed `examples/sco-private/`: `before-private.mjs` with env-injected 256-bit key + Node crypto 15,000 HMAC rounds; byte-exact compiler-generated `after-public.mjs`; `build-sample.cjs` deterministic generator/check; `server.cjs` authenticated localhost public ESM/RPC endpoint using real `createScoHandler` and server-private ESM import; example README and root README link. Added `.gitattributes` for cross-platform LF generated artifact.
- `test/sco-real-example.test.js` verifies native-vs-actual-served proxy results, full service calls, withheld secret, forbidden source retrieval and unauthenticated 403, all with fresh random key. Added manual SCO oracle CI and `jsconfig.external.json` strict JSDoc membership for example and test.
- Initial run `43719158729` failed because Windows checked out LF artifact as CRLF and test assumed on-wire SCO response equals untransformed builder facade. Fixed snapshot with `.gitattributes`, updated test to import actual served second-pass-obfuscated module from atomic temp file.
- **Pinned full focused green Linux/Windows [run 43719354840](https://github.com/FlareZ123/obfs/actions/runs/43719354840)** at commit `6572d764cb212c3ab50fdf084df7046ab9aac4f3`, all workflow steps including exact sample check, live RPC equality, JSDoc typecheck succeeded.
- Source code `src/sco.js` documented `allowedHosts` as attacker-forgeable HTTP Host routing filter, not authorization. New `test/sco-host-header-spoof.test.js` demonstrates 200 with forged host alone, 403 without separate read/RPC authorization. Cross-platform green `43718121748` at `735eb3bde8806e706c48368d6ebe7d96e4b87f96`.
- `sims/external-function-source-contract.js` proves opaque external bridge may reveal exact `Function.prototype.toString` or stack locations while AST contains no local observer; same for separately imported ESM exported function, under native execution. Cross-platform green falsification `43717875329` at `e064f1fc8d0355d93228d506888542f6572388d8`. `im-results/opaque-external-source-contract-2026-11-15.md` documents evidence. Corrected `im-results/stack-observer-2026-11-15.md` with expanded green.
- Read [maintainer directive](../../communications/broadcast/2026-11-15T1240Z_maintainer_advanced-obfuscation-directive.md) calling for advanced real before/after samples. Sent response `communications/broadcast/2026-11-15T133550Z_agent50_real-sco-before-after-example.md`; sent Agent16 `communications/agent16/2026-11-15T133500Z_agent50_opaque-stack-observer-followup.md`.
- Limitations: Node/browser ESM facade can be inspected and used online; server-side private implementation cannot be retrieved from client under trusted-server model, but the cryptographic service is an oracle for authorized clients. Basic auth localhost-only, lack of production network/TLS/browser performance measured. COO/SNO strong full-control obfuscation remains unproven.
- Next: Consider real headless Chrome with Basic auth; local /usr/bin/chromium hangs when launched under container mock HTTP, so do not claim verified browser demonstration. Existing `.github/workflows/manual-browser.yml` has Chrome, could test remote but avoid expensive risky CI unless robust. Existing `manual-sco-oracle.yml` verifies Node live ESM, not Chromium.
- Actual lease claim remains `2026-11-15T12:37:46Z`; **release at measured >=13:47:46Z** only, deleting lease after all other state pushed. Commit title prefix Agent 50. Do not release before cutoff.
