# Agent 42 research continuity

Normal identity claim: 2026-11-15T19:57:21Z. Latest full Linux/Windows validation initially red with four transformation-coverage failures and one branch sample golden mismatch; see im-results/manual-validation-triage-2026-11-15.md.

Root conflict: src/properties.js conservatively refuses field renaming when an original member expression can appear in a native TypeError for a failed method call. This is real under prototype monkeypatching, so do not blindly remove this proof gate.

Prepared a coordinated change in test/array-property-values.test.js, test/cross-file-hash-collision.test.js and test/cross-file-identity-grid.test.js to stage a field read before method invocations, preserving the positive ESM and property-flow assertions without a source-spelling confounder. Added local and ESM prototype-mutation witnesses in test/source-spelled-operand-errors.test.js. The unmasked branch-blocks after/gate.cjs needed two extra parenthesis pairs around ternary state updates to match the present compiler. See im-results/property-coverage-source-spelling-reconciliation-2026-11-15.md.

Next: run targeted cross-platform Node tests, then one immutable-source full Linux/Windows/Chromium/JSDoc gate when focused passes. Keep security claims separate from coverage engineering. Adversarial SCO private-partition resistance and 2.5x session budget are distinct open research tasks.

## Verified outcome

Full Linux/Windows/Chromium gate 43756140634 passed at source 5f8fc07de415310fabf36d0e77cf1ee3645cac6d: 1,065 passed, zero failed, one skipped (1,066 tests) on each Node 22 platform. Both JSDoc checks, seven sampled benchmarks, and 14 Ubuntu Chromium fixtures succeeded. This snapshot is a descendant of the repair commit 1bf1c6ae3a9935bf702e6c65d907b7a9fd76e8d0. README and results/README status should cite the immutable pin. Unsolved: stronger obfuscation resistance and whole-session cost under primary threat models.

## Pinned private-constant SCO extension and limits (20:36 UTC)

Added `src/sco-selective-partition.js` support for server-private unexported primitive-literal `const` declarations, source pair/builder under `examples/sco-private-const/`, targeted native/HTTP, real Chromium, and attacker relay trials. Principal commits: a8ced61 (feature), 03d335e (attacker), 2013421 (browser), 848ef93 (thin-vs-amortized trials), d2a9dad (separate direct client from extra attacker proxy). Focused [CI 43758970044](https://github.com/FlareZ123/obfs/actions/runs/43758970044) green at d2a9dadb4801a1d656230bac3df76136875ef8b6.

Native vs direct SCO **single HMAC**: 23.87× Ubuntu, 22.54× Windows, failing 2.5×. Native vs direct SCO **100k local normalizations + 1 HMAC**: 1.31× Ubuntu, 1.23× Windows. Authorized external relay cloned 20/20 held-out outputs without extracting original HMAC key. Browser with HttpOnly cookie and server-only node:crypto HMAC matches native. See im-results/sco-private-primitive-constants-2026-11-15.md for full table and caveats.

Future: permit explicitly trusted runtime-injected server-only environment consts (e.g. process.env) under a narrow opt-in, avoiding checked-in demo key; verify public references are rejected. Crucial: conventional source hiding cannot prevent live authorized relay or guarantee thin-call budget. Pinned full integration should be rerun after a coherent feature snapshot.

## Newest pinned integrated release and runtime secrets

Added explicitly opt-in `allowServerEnvConstants:true` in `src/sco-selective-partition.js`, admitting static Node `process.env.UPPER_SNAKE_CASE` private constant initializers and rejecting dynamic names, public secret reads, and public ambient aliases. Original source is retained on the server. Reproducible before/after and atomic builder are in `examples/sco-private-env/`. Key value is set through 32 random bytes in tests, never checked into source. Commits: 7d074a4 (opt-in), 6ed06bf (two real browser variants), 593124c (ambient-root veto).

The pinned [full run 43760117031](https://github.com/FlareZ123/obfs/actions/runs/43760117031) passed at `593124c29f0579f5d160ee9c9c877c6a28c35f29`, **1,076 pass / 0 fail / 1 skip / 1,077 total** on Ubuntu and Windows, with strict JSDoc, benchmarks and 14 Ubuntu Chromium fixtures. [Focused SCO 43760113251](https://github.com/FlareZ123/obfs/actions/runs/43760113251) passed the same source including actual Chromium cookie-authorized HMAC for both literal and runtime-injected secrets. Full user-facing claim should cite this immutable pin, not a moving branch HEAD.

Remaining hazards for next incarnation: investigate `this`-based global access and static free-variable alias proofs when env binding exists; all full-control attacker models still permit authorized relaying or runtime extraction. The 2.5× budget fails the thin-call workload (~23× direct SCO) and passes only measured amortized mixed sessions (~1.2–1.3×). Do not overgeneralize.

## Final intended gate and remaining gap (20:58 UTC)

Added one more fail-closed opt-in rule in commit `620b3ac`: a public `this` receiver can alias the trusted server's process/global, so reject public `ThisExpression` alongside ambient identifiers. Added regression that tries `local(){return this.process.env.OBFS_KEY;}`.

Both [focused SCO 43760746861](https://github.com/FlareZ123/obfs/actions/runs/43760746861) and [full integrated 43760750888](https://github.com/FlareZ123/obfs/actions/runs/43760750888) passed at exact source `620b3acb49cfe3a0cd61bc1c312398a72a344555`. Full result per OS **1,076 passed, zero failed, one skipped of 1,077**, both strict JSDoc, benchmarks and 14 Ubuntu Chromium fixtures. Documentation commit postdates this pin but only updates report prose. Complete remaining work: reconfirm shared remote and release lease after measured 70-minute age; never interpret green tests as anti-instrumentation proof.

Unresolved source-level edge: broader interprocedural alias/reflective public state and opaque browser-host objects remain outside the primitive/env constant proof. SCO authorized live relay clones outputs; direct thin RPC ~22–24× native. COO/SNO attacker-controlled runtime negates absolute integrity. Stronger architecture has to show an independent attacker failing while 2.5× whole-session costs remain met.
