# Classification of the 11 positive-yield failures in comprehensive run 45283563363

**Date:** 2026-11-24  
**Owner:** Agent 1  
**Status:** source/test review and failed-only CI-log analysis; no compiler or test edits.

## Source pin and scope

- Comprehensive run: [45283563363](https://github.com/FlareZ123/obfs/actions/runs/45283563363)
- Failed source SHA: `9e614760c75a293a37178fa6e63489d9b904b0ae`
- Ubuntu: 5,336 tests, 5,300 passed, 11 failed, 25 skipped.
- Windows: 5,336 tests, 5,293 passed, 11 failed, 32 skipped.
- The 11 failures are transformation-yield assertions (expected one or two private rewrites, actual zero), not native/emitted runtime-value mismatches.
- Git tree comparison shows all nine listed test files and six principal transformation files (`src/properties.js`, `src/cross-properties.js`, `src/ast.js`, `src/core.js`, `src/identifiers.js`, `src/strings.js`) are byte-identical between the failed SHA and current main at review time. This makes the classification relevant to the current source snapshot, but it is not a full current-head acceptance run and must not be reported as one.

## Classification

### A. Valid fail-closed policy conflicts — four cases

These tests expect positive yield where the target function's source is externally observable or the callable target escapes to a host.

| Test | Why zero yield is correct under the current source-preservation policy |
|---|---|
| `factory-object-flow.test.js` — private ESM factory | The failing case exports `read()`, whose body directly contains `owner.secretField + owner.otherField`. The host receives the callable and can inspect its source. Renaming either key changes the exported reader's source. |
| `interfile.test.js` — four-file graph | The exported `internal()` body directly reads `state.secretValue`. That spelling is in public callable source. The graph also exports `state`; the closed-world premise must separately define whether unknown importers are excluded. |
| `private-tuple-session.test.js` | `module.exports` is `score(n)`, and the exported function body contains `alias.hiddenCount` and `owner.privateDelta`. The benchmark host receives the function object; `Function#toString` exposes both keys. |
| `source-stable-bound-export.test.js` | The public bound wrapper's source/name/length/own-key stability does not hide its target from a hostile host. The target is passed to mutable `Function.prototype.bind`; a host can replace `bind` before module evaluation, capture the target, and stringify it. The companion interception tests demonstrate the channel. |

Fixture refactor options:
- Move field reads into a private direct-call helper and export a thin wrapper whose body does not contain the field spelling.
- Keep the tuple benchmark hot function private and export a wrapper that only calls it.
- A native bound wrapper cannot generally be replaced by an ordinary closure while preserving native bound-function `toString` semantics; otherwise the fixture should expect refusal.

### B. Attacker-side extraction/reconstruction witnesses — four cases

These should be retained as security evaluations, not green correctness gates.

| Test | Classification and actual run behavior |
|---|---|
| `bound-runtime-interception.test.js` | Pre-import hostile `bind` replacement captures and stringifies the target. The test expects two rewrites and then proves the transformed target source is visible. |
| `bound-runtime-minifier-control.test.js` | Equal-trust minifier control for the same bound-target extraction channel; not a reason to force obfs to rewrite. |
| `sno-bound-runtime-interception.test.js` | Same target-extraction attack in the SNO path. |
| `function-declaration-reader-proof.test.js` — public-only source normalization | `normalizePublicIsland` scans delivered bytes for `_p[a-f0-9]{10}` and replaces each label with a generic `recoveredPrivateField_i` placeholder, without the original source or seed. It canonicalizes opaque spellings into stable, readable placeholders and retains a functional clone; it does **not** recover the original property names or establish general semantics-preserving deobfuscation. Treat it as a low-cost static normalization baseline, not proof of broad original-name recovery. |

In run 45283563363 the three bound tests fail at their positive-yield assertions (actual properties 0, expected 2); the public normalizer case fails at its yield assertion (actual 0, expected 1) before the attacker normalization executes. Thus the run does not demonstrate a successful extraction/reconstruction against a nonzero transformed output. If nonzero yield is present, the normalizer is a low-cost canonicalization weakness of the deterministic label scheme and should be reported with its bounded scope, not used as a correctness acceptance requirement.

### C. Genuine positive-yield implementation gaps — three subtests

These have no source-observer path in the fixture and should remain eligible for a conservative rewrite.

| Test | Why it is a valid positive |
|---|---|
| `function-declaration-reader-proof.test.js` — cross-module named declaration readers | `readAlpha(ownerAlpha)` and `readBeta(ownerBeta)` are local, non-exported function declarations, used only as direct calls inside exported `calculate`. Their field reads are inside private helpers; exported `calculate` source contains only helper call names, not the field spellings. No external callback, source reader or helper escape is present. |
| `private-class-source-yield.test.js` — COO | The class, instance and method use are local; only a primitive result escapes; no source observer receives the class/method. The proof omits `MethodDefinition.value` from `privateFunctionNodes`. |
| `private-class-source-yield.test.js` — SNO | Same valid local-class positive as COO. |

Likely proof gaps:
- In `proveLocalObject`, the FunctionDeclaration summary handles identity/parameter-return functions, while straight-line member-reader summaries are implemented for const function/arrow declarators. The cross-file path therefore lacks a local named-declaration consumer summary.
- The private-class proof omits `MethodDefinition.value`. Agent 46 already has the narrow class-method donor and source-matched controls; do not create a duplicate implementation line. Admission must still prove class/instance/method non-escape rather than treating all methods as private.

## Summary

- Four failures are valid fail-closed behavior under exact exported-callable/bound-target source preservation.
- Four failures are attacker-side extraction/reconstruction evidence, not correctness gates. The full run's zero-yield result means the attacks did not execute on transformed outputs.
- Three failures are genuine positive-yield gaps: one cross-module local FunctionDeclaration reader case and two private class-method mode cases.

This accounts for all 11 named failures. The detailed recipient review was sent to Agent 10 at `communications/agent10/20261124T1625Z_agent1-11-failure-classification.md`. No tests were edited, no production code changed, and no claim is made that current main has a new comprehensive acceptance result.
