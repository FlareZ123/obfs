# Agent 10 — full-suite review of primitive-prototype donor

**Branch head:** `agent33/primitive-realm-prototype-guard-20261128` at `6fcc54c328c643f5e43736ac159592a6f0446e67`  
**Focused graph run:** [46179214229](https://github.com/FlareZ123/obfs/actions/runs/46179214229) — success at earlier head `098e48f...`  
**Full validation:** [46179406124](https://github.com/FlareZ123/obfs/actions/runs/46179406124) — failure on Ubuntu and Windows, 19 failed tests.

## Progress since the first review

The earlier failures around the transitive metadata fixture, host-effect diagnostic ordering, deterministic UTC expectations, and the own string-index positive control are no longer present in the current full-suite failure list. In particular, the in-range `"abc"[0]` positive control appears restored. The focused graph workflow also passed at `098e48f...`.

That is real progress, but it does not make the donor ready to integrate: the full validation run is still red on both platforms.

## Eight SCO-specific failures

The full-suite logs show these failures in the donor's SCO path:

| Test | Observed result | Review |
|---|---|---|
| `sco-intrinsic-constructor-chain.test.js:22` — inherited constructor mutation | A case using `const Native=(0).constructor; Native.__obfsCtorCanary=41` is not refused as expected | Security false negative: constructor access is inherited from a realm-local primitive prototype |
| `sco-intrinsic-global-alias.test.js:42` — transitive aliases to JSON/RegExp state | Missing expected exception | Security false negative: assignment/alias/destructuring paths are not all covered |
| `sco-intrinsic-realm.test.js:48` — prototype access hidden in private/public helpers | Missing expected exception | Security false negative: helper bodies/call edges are not fully included in the realm-state audit |
| `sco-intrinsic-realm.test.js:109` — `RegExp.$1` and related legacy state | Missing expected exception | Security false negative: realm-specific RegExp match state is not rejected |
| `sco-primitive-locale-effects.test.js:66` — locale-insensitive primitive methods | Rejected with `Selective SCO cannot partition realm-local prototype access` | Likely a stale positive expectation: inherited primitive methods remain patchable even if their normal output is locale-insensitive; retain own-property/explicitly safe Intl controls instead |
| `sco-private-graph-admission-boundary.test.js:14` — private child mutates `Math`, public code reads it | Missing expected exception | Security false negative: the test supplies a private import path but no private source bytes; an unaudited private dependency must not be treated as proven safe |
| `sco-private-process-loader.test.js:55` — explicit `node:crypto` plus environment constant | Rejected as unproved module initializer state | Yield regression: a captured primitive server secret is not a shared mutable object; the private-child identity gate currently ignores the explicit server-environment option |
| `sco-private-transitive-relay.test.js:31` — three-file authorized HMAC relay | Rejected at `private/deep/leaf.mjs` for the same module initializer reason | Yield regression: the guard blocks a common server-private secret pattern and prevents the authorized relay control from running |

### Specific implementation implications

- The constructor-chain witness shows that `(0).constructor` must be treated as a realm-local inherited read, including when aliased before mutation.
- The alias and helper tests require fixed-point propagation through assignments, destructuring, aliases of `globalThis`/intrinsic roots, and local helper call edges. A direct syntax scan of only the selected function body is insufficient.
- Add explicit checks for `RegExp.$1`, `RegExp.lastMatch`, `RegExp.input`, and their statically recoverable aliases.
- The private graph admission boundary must fail closed when `privateModuleImports` names a child but no source bytes are provided for auditing. A missing audit source is not evidence of safety.
- `assertNoSharedChildFunctionIdentity(filename, ast)` is called before server-constant option handling and receives no options. It therefore rejects `process.env.KEY` in private dependencies even when the caller intends an explicit server-constant policy. If server environment snapshots are an allowed SCO feature, thread the opt-in through this guard and prove the initializer captures a primitive string/number exactly once. Otherwise revise the positive tests and document the limitation; do not silently claim support.

## Eleven failures from an out-of-date integration base

The other 11 failures are in bound-runtime/source-observer, factory, inter-file property, private-class yield, and SNO positive-yield tests:

- bound runtime interception and bound minifier control;
- two-file ESM factory execution;
- direct named declaration reader rewrites;
- public-only source normalization;
- four-file ESM dataflow;
- COO/SNO direct-use class owner renames;
- private tuple cold-session measurements;
- SNO bound-runtime interception and source-stable bound export.

These correspond to work on the separate Agent 1/Agent 9 integration candidate, not to the primitive-prototype guard's narrow SCO semantics. The donor branch is not based on that candidate. For comparison, Agent 1's [full validation run 46175756818](https://github.com/FlareZ123/obfs/actions/runs/46175756818) on `agent1/pr384-source-observer-island-local-yield-20261128` succeeded. Rebase the donor onto the actual integration candidate before using the full-suite result to assess combined behavior; do not “fix” these 11 by weakening unrelated compiler proofs.

## Disposition

**Do not integrate yet.** The focused graph run is useful but the full validation remains red. Resolve the five security false negatives, decide the explicit server-secret policy for private dependencies, and rerun the donor on the current integration candidate. Preserve the restored own string-index positive and the inherited-method refusals; they are the right direction for balancing semantic safety and transformation yield.
