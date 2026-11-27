# Private-reader binding identity: scoped proof extension

**Status:** Intermediate research prototype on `agent4/private-reader-binding-identity-20261126`; not merged into PR #379 and not an established release result.

## Problem

The local `proveLocalObject` private-reader lane used a name-keyed alias inventory. Two distinct private reader functions that happened to use the same formal name (and the same local temporary name) could be conflated or rejected even when each direct call passed the same uniquely tracked owner object. The old regression test expected refusal for two readers both named `owner`; that expectation is obsolete once the proof tracks exact AST bindings.

This prototype is deliberately local to `src/properties.js`. It does **not** claim to solve Agent 7's imported-owner/cross-file reader case; a scope clarification was requested in `communications/agent7/20261126T073000Z_agent4-same-name-reader-scope-question.md`.

## Proof shape

The implementation on the branch:

1. Accepts only a direct, non-optional, one-argument call to a local reader function.
2. Requires a nonescaping, direct-call-only reader in `privateFunctionNodes`; exported readers remain excluded because external callers may supply arbitrary objects and depend on the original property contract.
3. Restricts the reader to one identifier parameter and a complete, side-effect-free body that either returns one static noncomputed member read or assigns that read to one `const` local and immediately returns that local.
4. Checks **every** direct call site of the reader. Every call must have exactly one argument, and every argument must be a tracked alias of the candidate owner. A single untracked/mixed-owner call rejects the proof.
5. Returns the exact `member.object` AST node, not its spelling. The alias pass exempts only the exact call-argument nodes and exact reader-owner nodes proven by this grammar. The temporary's identifier uses are filtered by the exact reader ancestor, so same-spelled locals in other functions do not collide.
6. Caches the proof per reader AST node to avoid rescanning all call sites for each of N calls.

The exact-node exceptions are narrow; ordinary scope checks remain in force for all other identifiers. Optional calls, spreads, extra arguments, computed/optional members, async/generator readers, escaped/exported helpers, and mixed-owner call sites remain fail-closed.

## Evidence

- **Focused run 4275 / 45775103824**, source head `65652488cf37a58ebb659e3905e8330b41f5145e`: the same-spelled parameter/temp positive and mixed tracked/untracked-owner negative passed on Ubuntu, Windows, and macOS.
- **Focused run 4281 / 45775783490**, source head `b910b9f360a11ba5116b8e755babf3769b071794`: the added nested class-static-block reader refusal also passed on all three operating systems.
- **Full run 4277 / 45775246556**, source head `65652488cf37a58ebb659e3905e8330b41f5145e`: failed the behavioral/adversarial step. Ubuntu reported 5,457 tests, 5,422 pass, 10 fail, 25 skipped; Windows reported 5,457 tests, 5,412 pass, 10 fail, 35 skipped. JSDoc/typecheck, benchmark, profile, compute-budget, and Chromium steps passed. Nine failures were existing yield gaps; the tenth was the obsolete duplicate-formal test expectation, now updated in this branch to expect one object/one property rename. The full run predates the per-reader cache and later test additions.
- **Focused run 4284 / 45778521339** was dispatched against head `01060f5126152d9bcf3ec65c6a95549aa7d0d222` but remained queued at the last check. It includes the cache and expanded test file, but predates the later update to `function-declaration-reader-proof.test.js`. Do not report it as passed.
- Factory/private-reader experiment **run 4271** passed its earlier focused suite on all three operating systems. Its host-source equality assertion was subsequently corrected: only runtime parity is a compatibility assertion; hostile host source inspection should see transformed code.

## Test matrix currently committed on the branch

`test/agent4-private-reader-binding-identity.test.js` contains:
- positive: two private readers with same-spelled parameters and same-spelled local temporaries;
- negative: one reader called with both tracked and untracked owners;
- conservative refusal: block-scoped reader nested inside an exported class static block (scope proof not yet supported);
- negative: exported generic reader with arbitrary owner parameter (public API semantics);
- positive: module-private reader called from an exported class static block;
- positive: directly-invoked arrow in an exported class field rewrites the private key, and an external host probe sees the transformed class source;
- negative: an in-program `Reader.toString()` observer blocks a source-changing rewrite.

The last three additions and the per-reader cache await focused CI. The updated duplicate-formal regression also awaits focused CI.

## Threat-model correction

External DevTools, preloaders, and hostile callers invoking `Function#toString` are attacker observations, not source-preservation requirements. They should see transformed source. Only source observation performed by the original program itself creates a source-dependent semantic constraint; the implementation should preserve that behavior or fail closed.

An exported generic `read(owner)` remains unsafe to rewrite because external callers can pass arbitrary objects. A zero-argument exported wrapper over a provably private owner may be safely transformable even though its source changes. The current implementation remains conservative for such wrappers; `factory-object-flow` is a potential yield gap, not automatically a required refusal.

## Full-gate comparison and unresolved work

Agent 3's class-guard branch, run **4280 / 45775382170** at `1b260debf0831ed7a119da8ae858c54cec74e4a8`, has seven full-suite failures on both Ubuntu and Windows:
- hostile bind interception of a private target;
- pre-import bind interception under minification;
- private ESM factory flow;
- four-file ESM dataflow;
- private tuple cold-session profile;
- SNO nonconstructible bound private target;
- bound public export with private primitive keys.

Compared with run 4277, the class-guard branch removes the two private-class-source-yield failures; the binding-identity patch removes the duplicate-formal refusal once the stale expectation is updated. Neither full run is green. The bind-capture failures need renewed analysis under the corrected attacker-source policy; the factory and private tuple cases may be safe-yield opportunities; the four-file exported-state case needs an explicit closed-world/public-API boundary analysis.

Agent 10 independently reviewed Agent 3's class guard and its focused class/source-observer suites, but the broad guard may still over-refuse safe closed-over-object reads in class initializers. The new direct-IIFE-in-class-field test is intended to distinguish attacker-visible transformed source from in-program source observation.

## Next actions

1. Obtain a completed focused run for the latest branch head (including cache, all seven focused cases, and the updated duplicate-formal test).
2. Ask Agent 3 to review the exact-node/cache implementation under runtime/API semantics, not external source parity.
3. Resolve whether Agent 7's same-name imported-owner issue is a separate cross-file proof path.
4. Investigate the seven remaining full-gate yield gaps, especially bound-target interception and zero-argument exported wrappers over private owners.
5. Do not merge this experiment or treat any focused pass as a full-gate pass.
