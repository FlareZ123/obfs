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

The same string-only test was copied to the isolated Agent 48 candidate review branch. [Run 44984879066](https://github.com/FlareZ123/obfs/actions/runs/44984879066), head `73e98b0115280d31ed13deae1aaf186d20b6b65e`, confirms the same result on both operating systems: 3/3 exported callable source cases fail across COO/SCO/SNO, and 3/3 private nonescaping controls pass. The candidate's direct-export matrix still passes 48/48 Node tests in that run, but this does not cover string encoding of an externally exported callable. The candidate review workflow remains failed by design on the added string/aggregate witnesses and also has the separate unresolved CacheStorage browser witness failure described above.

## Precision control for private class methods

To distinguish necessary source refusal from an overbroad class ban, I added `test/esm-private-class-positive-yield.test.js`. Its module-local class instance never escapes; only a primitive `value` is exported. The external importer cannot obtain the class, instance or method, and the test requires identifier renaming in the private method while preserving the exported value.

- Mainline test branch [run 44985080284](https://github.com/FlareZ123/obfs/actions/runs/44985080284): the private-class positive-yield step passed on both Ubuntu and Windows (3/3 modes).
- Candidate review branch [run 44985083819](https://github.com/FlareZ123/obfs/actions/runs/44985083819): the same step failed on both Ubuntu and Windows (0/3 modes). Its assertion requires `bindings > 0`; the candidate's blanket `ClassDeclaration`/`ClassExpression` ancestor veto leaves this private method untransformed.

This confirms the candidate's public private-class-instance case passes by refusing class method rewrites broadly, not by distinguishing escaped from nonescaping classes. That is a safe correctness tradeoff, but it suppresses a genuinely private transformation opportunity. The integration gate should pair public class-source preservation with this private-class yield control so precision is measured rather than inferred from source parity alone.

## Exported class constructors and the narrow primitive-leaf exception

The string matrix was expanded to include `export class Api { static label="source-visible-class-field"; }` and an external importer that calls `Function.prototype.toString.call(Api)`. On the mainline test branch, [run 44985361691](https://github.com/FlareZ123/obfs/actions/runs/44985361691) completed the relevant steps on both Ubuntu and Windows:

- 6/6 public source tests failed across COO/SCO/SNO (exported function source and exported class-constructor source, each in three modes).
- 3/3 private nonescaping string-encoding controls passed.
- The class/function cases each logged one literal rewrite, `sourceEqual:false`, `valueEqual:true`.

The same string matrix on the ESM candidate review branch [run 44985365679](https://github.com/FlareZ123/obfs/actions/runs/44985365679) also reports 6 public source mismatches and 3 private controls passed on both operating systems. The candidate's existing class ancestor veto does not cover string encoding of the class's static field source.

Agent 50 identified an important precision exception in the existing `purePrimitiveLeafExports` source-island proof. It accepts only immutable primitive own records, immediate primitive reads, and a zero-argument named exported function whose body is a single return of an already-read primitive identifier. The function source itself has no property read, parameter, nested callable, aggregate, or arbitrary expression. The permitted island rewrite changes top-level property tokens outside the function body, so an external importer can still observe identical function source.

I added `test/source-observer-islands-external-callable-source.test.js`, which:
- supplies the watched module, primitive leaf and entry module to the compiler;
- keeps the external importer out of the compiler input group;
- compares exact `Function.prototype.toString.call(unrelated)` and the ordinary return value;
- requires at least one real local property rewrite in the selected leaf, while cross-file, identifier and literal rewrite counts remain zero.

This narrow positive case passed 3/3 modes on both Ubuntu and Windows on mainline [run 44985281120](https://github.com/FlareZ123/obfs/actions/runs/44985281120) and the candidate review branch [run 44985283845](https://github.com/FlareZ123/obfs/actions/runs/44985283845). Thus a source-exposure gate must preserve this specific source-stable exception; a blanket veto of all exported callables would lose valid property-renaming yield. Do not generalize the exception to returned functions, aggregates, member expressions, getters, parameters or arbitrary calls without extending the proof and tests.

The broader candidate review branch still has a separate private-class yield failure (0/3 modes) under its blanket class-ancestor veto, while the mainline private-class control passes 3/3 modes; see the preceding section.

## Real-browser external-importer validation and strict JSDoc

The external primitive-leaf callable-source check was also executed in real Chromium by `test/source-observer-islands-external-callable-browser.js`. The page is not part of the compiler input; it imports `independent.mjs` directly and calls `Function.prototype.toString.call(unrelated)`. It compares the original, emitted and public-normalized graphs.

On mainline test branch [run 44985651991](https://github.com/FlareZ123/obfs/actions/runs/44985651991), Chromium reported:

```
SOURCE_ISLAND_EXTERNAL_CALLABLE_BROWSER {
  "browser":"Chromium",
  "fields":2,
  "matchedGraphs":3,
  "normalizedFields":2
}
```

The same Chromium step passed on the Agent 48 candidate review branch [run 44985655281](https://github.com/FlareZ123/obfs/actions/runs/44985655281). This confirms the exact callable-source preservation and two genuine local property rewrites in the browser ESM linker, not only Node's ESM loader.

All five new test files were added to `jsconfig.external.json`. The mainline review run [44985868808](https://github.com/FlareZ123/obfs/actions/runs/44985868808) passed both `npm run typecheck` and `npm run typecheck:external` on Ubuntu and Windows. The overall workflow remains red only because the intentional source-parity witnesses are expected to fail against the unfixed compiler; the strict JSDoc checks themselves pass.

The Agent 48 candidate review run [44985872501](https://github.com/FlareZ123/obfs/actions/runs/44985872501) also passed both `npm run typecheck` and `npm run typecheck:external` on Ubuntu and Windows after the same test files were added to its external JSDoc scope. Both review branches therefore type-check; their overall CI remains intentionally red on the external callable source-parity assertions.

## Chromium reproduction of string-encoding source mismatch

The new `test/esm-exported-callable-string-browser.js` executes an external HTML importer in real Chromium against the original and emitted ESM module. [Mainline run 44986043970](https://github.com/FlareZ123/obfs/actions/runs/44986043970) reproduced the Node finding in the browser. Chromium's assertion diff showed:

- Original function source: `function read(){return "source-visible-secret-value";}`
- Emitted function source: `function read(){return _o9472bb669ddd[0];}`
- Original class source: `class Api{static label="source-visible-class-field";}`
- Emitted class source: `class Api{static label=_o9472bb669ddd[1];}`
- Both ordinary values remained exactly equal.

The browser fixture requires at least two string literals to be transformed, and the emitted source uses the generated lookup array inside both public source ranges. This is a browser ESM reproduction, not merely a Node inspector artifact. The same run's separate primitive-leaf island Chromium check passed with two property rewrites and three matching graphs. Strict `typecheck` and `typecheck:external` also passed on Ubuntu; Windows typecheck passed in the same run.

The same real-Chromium string-encoding witness also failed on the Agent 48 candidate review branch in [run 44986046434](https://github.com/FlareZ123/obfs/actions/runs/44986046434). Its browser diff is identical: the function and class source strings contain the generated lookup-array reads, while `functionValue` and `classValue` remain unchanged. The candidate branch's 48/48 direct-export Node suite passing therefore does not cover this string-encoder path. The mainline and candidate review branches both pass strict root and external JSDoc checks after the new browser test was added to the external config.

## Raw-source preservation with comments and whitespace

I extended the primitive-leaf fixture so the exported function body contains an internal comment, blank line and indentation. The external importer still compares the complete `Function.prototype.toString.call(unrelated)` result. This exercises raw source preservation rather than only token spelling in a compact one-line function.

On mainline review run [44986425086](https://github.com/FlareZ123/obfs/actions/runs/44986425086), the Node test passed in all three modes on both OSes and the real Chromium external-importer test passed with `fields:2`, `matchedGraphs:3`, `normalizedFields:2`. The same Node test and Chromium step passed on Ubuntu on candidate review run [44986429525](https://github.com/FlareZ123/obfs/actions/runs/44986429525); the candidate Windows Node step also passed, while browser execution is Ubuntu-only. The source range including its comment and whitespace remained exact while the two top-level property edits occurred outside it.
