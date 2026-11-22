# External ESM callable reachability through aggregate aliases and returned values

**Date:** 22 November 2026  
**Status:** Reproduced on Ubuntu and Windows Node 22. Research-only compatibility finding; no compiler implementation changed.  
**Branch:** `agent8/callable-aggregate-reachability-20261122`  
**Test source:** `6b04c7f51b6f44e14e4d275b476b9c577e4f1386`  
**CI:** [run 44984346437](https://github.com/FlareZ123/obfs/actions/runs/44984346437)

## Question

Can an external ESM importer observe callable source that is reachable through an exported aggregate or returned value, even when the callable itself is not a direct export and the importer is not supplied to `obfuscateFiles`?

The test deliberately uses `closedWorld:true` for the transformed source group while keeping the consumer in a separate, unsupplied `observer.mjs`. It enables only identifier rewriting (`properties:false`, `strings:false`, `controlFlow:false`) to isolate source changes in callable parameters.

## Reproduced cases

The matrix covers six shapes, each in COO, SCO and SNO:

1. **Exported object shorthand:** `function read(secretParam) {...}; export const api={read};`
2. **Exported object alias:** `const local=read; export const api={read:local};`
3. **Exported array:** `export const api=[read];`
4. **Private class instance:** `class Api { read(secretParam) {...} }; export const instance=new Api();`
5. **Returned callable:** an exported `make()` returns a local `hidden(secretParam)` function.
6. **Getter-returned callable:** an exported object's getter returns a local `hidden(secretParam)` function.

The external importer obtains the callable through the exported value, invokes `Function.prototype.toString`, and calls the function to compare ordinary results. The importer is not part of the compiler input group.

## Source-pinned result

Run [44984346437](https://github.com/FlareZ123/obfs/actions/runs/44984346437) executed the 21-test matrix on **both Ubuntu and Windows** with the same result:

| Outcome | Per platform |
|---|---:|
| External callable source-parity cases | 18 failed |
| Private nonescaping helper controls | 3 passed |
| Total | 21 |

All 18 external cases logged `sourceEqual:false` and `valueEqual:true`; identifier rewrite counts were nonzero. The three private helper controls passed and asserted nonzero identifier-rewrite yield. Thus these failures are not caused by a no-op transform, and a separate private helper remains transformable.

The workflow intentionally stopped after this red-first step, so later source-proof, JSDoc and profiling steps were skipped. The result is a targeted semantic witness, not a full validation run.

## Interpretation

The direct-export tests in the existing ESM source-observation investigation do not exhaust public callable reachability. A consumer can obtain a callable through an exported object's identifier-valued member, an array element, an exported instance's private class, an exported function's return value, or a getter. Renaming a parameter inside that callable changes the source string while preserving the ordinary numeric return value.

This is consistent with the external-importer threat: the compiler cannot assume that a callable is private merely because its own binding is not named in an `Export*` declaration. Exported values can carry callable references across the module boundary.

The evidence does **not** prove that every such flow must be resolved precisely. A conservative refusal for source-exposed callables is valid under a strict 1:1 contract. Positive transformation yield is a separate requirement and is measured by the three private-helper controls.

## Integration requirements

The shared source-exposure proof should account for:
- Identifier-valued members/elements in exported object and array literals, following only uniquely resolved local bindings unless a broader flow proof is available.
- Instances of private classes exported through `new ClassName()`, including their reachable instance methods.
- Directly returned callable identifiers from exported functions and getters, with a bounded return-flow proof or conservative refusal.
- Captured declaration/reference spellings and property definitions outside the callable's source range when a protected callable depends on them.
- The same compatibility contract across identifier, property, string, control-flow and other source-mutating passes.

These cases should be incorporated into Agent 39's canonical cross-pass integration gate, alongside Agent 48's six-shape direct-export matrix, declared-observer controls, browser tests, and positive private-helper yield controls. Run the combined gate against one exact source SHA; isolated branch results do not establish compositional correctness.

## Limits

- Node 22 on Ubuntu and Windows only; this report does not add a browser reproduction for these six additional shapes.
- This is a source-fidelity correctness finding, not a confidentiality, anti-instrumentation, tamper-resistance, domain-locking, or performance result.
- No change to the release decision: **RELEASE-BLOCKED** remains authoritative.

## Cross-check against the ESM source-guard candidate

I copied the same 21-test file onto a review-only branch based on Agent 48's candidate commit `53ae87d85b14cc13035fefe71901f904b160134c`, without modifying its implementation. [Run 44984544117](https://github.com/FlareZ123/obfs/actions/runs/44984544117) executed the review matrix on Ubuntu and Windows Node 22:

| Outcome | Per platform |
|---|---:|
| External callable source-parity cases | 15 failed |
| External private-class-instance cases conservatively refused | 3 passed |
| Private nonescaping helper controls | 3 passed |
| Total | 21 |

The candidate therefore refuses the private-class-instance method case in all three modes (`bindings:0`, `sourceEqual:true`), but still changes source for the other five aggregate/returned-callable shapes in all three modes (`sourceEqual:false`, `valueEqual:true`). The three private-helper controls retain positive identifier yield.

In the same run, the candidate's existing direct-export suite passed 48/48 Node tests and its Chromium suite reported 27/27 external source/value matches plus 3/3 declared-observer matches. Those browser public cases all reported zero rewrites, which is a valid conservative outcome; the separate private-helper positive-yield control is in the Node suite. The workflow as a whole still failed: the added aggregate test was deliberately red, and the Ubuntu CacheStorage browser witness later failed because its original browser fixture produced no result element. That latter failure is separate and unresolved; it must not be hidden by the passing direct-export matrix.

The private-class case appears to pass because the candidate identifier guard blocks identifiers under any `ClassDeclaration` or `ClassExpression`, rather than because the exported-instance flow is proven. This is safe but broader than an export-reachability proof and may suppress transformations in truly private classes. The current candidate's direct-export matrix is useful evidence for its narrower scope, not evidence that aggregate-member aliases or returned callable flows are closed.

Candidate review branch: `agent8/review-agent48-callable-aggregate-20261122` at `eaf3ddf8dfc764eaef93fe48831f88f7179bb0a2`. This is an isolated review branch, not an integration branch.

## Independent string-encoder source-observation witness

A separate six-test matrix isolates string encoding from identifier/property rewriting. It exports `read(){ return "source-visible-secret-value"; }`, then uses an external importer to compare `read.toString()` and the ordinary return value. It sets `strings:true`, `minimumStringLength:1`, `properties:false`, and `identifiers:false`; the test requires a nonzero literal rewrite. A private nonescaping function is the positive control.

The test-only branch head `00ebbd8738c1bfbc515f8c55a7a8068b5bd02876` ran in [CI run 44984875822](https://github.com/FlareZ123/obfs/actions/runs/44984875822). Both Ubuntu and Windows Node 22 reported:

| Outcome | Per platform |
|---|---:|
| Public exported callable source cases | 3 failed (COO/SCO/SNO) |
| Private nonescaping function string-encoding controls | 3 passed |
| Total | 6 |

Each public case logged `literals:1`, `sourceEqual:false`, and `valueEqual:true`. Each private control retained nonzero string-encoding yield and equal ordinary output. Thus the source-exposure gap is not confined to identifier mangling or property rewriting: string encoding also changes externally observable callable source in all three modes.

Current `src/core.js` sets `shouldEncodeStrings` from the explicit in-group `remoteSourceObserver` result and mode/options. A public ESM callable with an importer outside the supplied file group does not set that flag, so the string encoder remains enabled. A shared export-source preflight must either preserve literals inside exposed callable/class source ranges or conservatively disable/decline that pass for those ranges.

This is still a source-fidelity result, not a confidentiality or security result. The workflow is red by design because it asserts the strict external source contract; the private controls ensure the answer is not to disable string encoding globally.
