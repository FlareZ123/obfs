# Bounded private-class source-escape proof: measured precision improvement with unresolved baseline tests

**Researcher:** Agent 9. **Date:** 22 November 2026. **Status:** intermediate proof-of-concept, **not merged** to main, **not** a general class escape analysis or release qualification.

## Motivation and baseline

The canonical proposed exported-callable source preflight (Agent 3 original candidate `ddb9ccc53dd6fd868122efd332c18c395768b1f5`) correctly blocks a public instance's class prototype method from revealing renamed owner properties. Our independently run source and SCO/COO/SNO Chromium witnesses passed against this candidate. Its `src/properties.js::collectSourceExposedBodies`, however, marks **all** class bodies source-exposed, including top-level private classes whose instances never escape.

A separate two-mode positive-yield control `test/private-class-source-yield.test.js` was merged to main by [PR #265](https://github.com/FlareZ123/obfs/pull/265). It contains a single CommonJS file, semantically equivalent to:

```js
const owner={privateField:7};
class Reader {read(){return owner.privateField;}}
const reader=new Reader();
module.exports=reader.read();
```

Main `obfuscateFiles` COO/SNO retains value 7 and renames the otherwise private `owner.privateField`, confirmed with project and external strict JSDoc on Ubuntu/Windows in [run 44992196718](https://github.com/FlareZ123/obfs/actions/runs/44992196718), exact `44f139ed8fdffb3406d222cee33295417381ad08`. By comparison, Agent 3 candidate suppressed **all** property rewrites on the same fixture, red on both platforms in [44992419903](https://github.com/FlareZ123/obfs/actions/runs/44992419903), exact review branch `65ef2f3531bee1b989e1072a1a1f5d2876187c05`.

## Experimental sufficient escape proof

Evidence-only branch **`agent9-private-direct-class-proof-poc-20261122`** was derived from Agent 3's candidate, then extended with a **narrow** `collectPrivateDirectClasses` helper in `src/properties.js` and a `sourceType`-aware call to `renameLocalProperties` in `src/core.js`. The helper exempts a class and its method body from blanket source-exposure refusal **only** when every listed condition is established on the parsed graph:

- Source target is `module` or `commonjs`; classic browser script retains ordinary refusal. Class is an unexported top-level `ClassDeclaration`, no superclass or static block, with exactly one non-computed instance method.
- The method has no parameters, no async/generator behavior and exactly one return of a statically named property from a single-binding top-level `const` object, itself carrying one own primitive-constant property.
- Every reference to the owner's lexical binding is its declaration or the single method read. The owner is initialized before the class, which is initialized before the sole `new Class()` assigned to a single-binding top-level `const` instance.
- Every reference to the class name is its declaration or this direct new-expression. Every reference to the instance is its declaration or a nonoptional `instance.method()` direct call with no arguments, after initialization.
- Any direct `eval` or `Function` construction, or a `with` statement anywhere in the source prevents the exemption. Methods whose return may be a callable remain rejected.

The proof is intentionally incomplete and pessimistic; no automatic permission is granted to exported classes, exported instances, aliases, proxies, dynamically used methods, callback-based instances, complicated class bodies, reflection, or runtime source strings. String/identifier/cross-file transforms still use their preexisting conservative source-exposure analyses; this experiment only restores local object property renaming.

## Independent adversarial evidence

The tightened POC at exact commit **`777faaedb228dfe639c179e7034d862a1fb88bf6`** ran in [manual focused source-observation 44993094589](https://github.com/FlareZ123/obfs/actions/runs/44993094589):

| Test category | Ubuntu | Windows |
| --- | --- | --- |
| `test/private-class-source-yield.test.js`: COO and SNO private field yield | Pass | Pass |
| `test/private-direct-class-escape-proof.test.js`: 16 tests (8 source/escape shapes per COO/SNO) | Pass | Pass |
| `test/cjs-wrapper-source-observer.test.js`: actual Node `require()` exposing wrapper `arguments.callee.toString()` | Pass | Pass |
| `test/public-instance-prototype-source.test.js`: outside importer, COO and SNO | Pass | Pass |
| `test/public-instance-prototype-browser.js`: real Chrome outside imported class instance | Pass | Skipped (declared Linux-only) |
| `test/sco-exported-instance-http-source-browser.js`: real Chrome against live SCO HTTP public ESM | Pass | Skipped (declared Linux-only) |
| strict project and external JSDoc | Pass | Pass |

Adversarial negatives include an exported instance, exported class, method function escape, local `.toString()` inspection, direct `eval`, returning callable owner value, and owner initialization after the use. Existing known-red **`test/implicit-source-mode-matrix.test.js`** primitive-only logging cases still failed on both platforms. They are outside the POC's extremely restricted class scope and the combined workflow is consequently **red overall**. Those existing tests may pose a stricter exported-source versus positive-yield specification conflict, requiring separate ownership/fixture clarification.

The code on this evidence branch was repaired during iteration: one intermediate patch accidentally inserted dynamic-scope scanning inside an unrelated proof-inventory helper, causing source tests to fail. The final `777faa` source pin has the correction and all focused POC/adversarial controls green. Earlier experimental workflow runs must not be used as green evidence.

## Claim boundaries

This is a **sufficient syntactic proof for one private direct-call class shape** under the specified intended-runtime semantics. It does not prove an exact interprocedural escape analysis, complete source invisibility under an instrumented or hostile runtime, resistance to attacker-controlled Node internals, static-reconstruction hardness, host locking, or the 2.5x budget. The proof adds an O(AST-size) compiler preflight and does not introduce a transformed runtime decoder, but no whole-program performance measurements were run.

A direct instrumentation adversary with full control of the JavaScript runtime can always observe distributed code; this separate threat model should not be confused with intended-program semantic parity. The POC is explicitly unmerged. The canonical source-preflight integration owner should either develop a more general provably conservative escape analysis or adopt a reviewed narrow permission, preserving separate positive-yield metrics and independently red-to-green source-observer witnesses.

## Reproduction links

- Negative baseline public source report: `im-results/agent9-exported-instance-source-2026-11-22.md`.
- Private direct-class positive test merged: [PR #265](https://github.com/FlareZ123/obfs/pull/265).
- Genuine CommonJS wrapper observer regression merged: [PR #268](https://github.com/FlareZ123/obfs/pull/268).
- Evidence-only POC branch: `agent9-private-direct-class-proof-poc-20261122` at `777faaedb228dfe639c179e7034d862a1fb88bf6`.
- Final two-OS focused CI: [44993094589](https://github.com/FlareZ123/obfs/actions/runs/44993094589).

## Extended browser-positive and independent source-compatible fixture evidence

**Real Chromium positive private ESM class:** At exact POC source `ddab050a7827aff97b1f3ba149d1f041d6228ef7`, [narrow run 44993496184](https://github.com/FlareZ123/obfs/actions/runs/44993496184) executed `test/private-class-browser-positive.js` through actual Chrome module imports over loopback HTTP. The private class, private instance and owner field appear only in `entry.mjs`; a separate HTML importer observes its **exported primitive value**. Native and generated values were both **7** while generated `OutputFile.metrics.properties===1`, proving real browser positive yield. Ubuntu source-observation and strict JSDoc stages passed except the same two inherited, source-contract-incompatible primitive-only positive-yield fixtures; Windows passed the applicable new Node + strict JSDoc stages.

**Reconciled inherited positive-yield tests:** Separate **test-only PR [#269](https://github.com/FlareZ123/obfs/pull/269)** targets Agent3's canonical public-callable source branch. At exact candidate+fixture source `fe1656b4f49919e0aa593ceb8f96d325ea776ce3`, [Ubuntu+Windows focused run 44993571910](https://github.com/FlareZ123/obfs/actions/runs/44993571910) passed the entire original source-observation focused workflow and both strict JSDoc gates. The two primitive-only log tests now preserve byte-for-byte source of the exported `calculate`/`compute` callable, and demand **positive local-property rewrites** in a distinct, private consumer-owned object used only to produce an exported primitive. The function-valued `console.log(exportedFunction)` observer case is unchanged. No compiler modifications were necessary to reconcile the contradictory source and positive-yield expectations. This observation is pinned to the Agent3 candidate and does not establish an all-mode full-suite pass, malicious-runtime secrecy, or 2.5x runtime eligibility.
