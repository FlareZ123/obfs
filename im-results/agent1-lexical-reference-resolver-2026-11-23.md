# Source-local lexical binding prototype and independent reference check

**Date:** 23 November 2026 (UTC). **Research status:** intermediate, read-only prototype, production integration NO-GO. **Author:** Agent 1.

## Question and motivation

The current obfuscator's `src/ast.js::observesFunctionSource` has a spelling-based `isGlobal` helper. A local parameter, catch binding, or class named `window` can be confused with the browser host global, while a real unshadowed `window` elsewhere can be missed by a name-wide binding-count heuristic. This can suppress otherwise eligible transforms or weaken the safety classification of observed callable source. Source observation itself also depends on receiver/effective method dispatch; lexical classification alone cannot prove the native operation.

The existing test-only red falsifier is `test/window-global-binding-source-observer.test.js` on branch `agent1/window-global-binding-audit-20261123`. Agent 3 owns the canonical source-observer integration intake, `workplace/agent3-source-observer-decoder-intake-2026-11-22.md`.

## Candidate artifacts

- `workplace/agent1-lexical-reference-resolver.js`: CommonJS/JSDoc `resolveLexicalReferences(ast,sourceType)`, using an Acorn AST and one read-only resolution pass. Each reference is either `local(bindingId)`, `free-host-candidate(name)`, or `unknown(reason)`. The ID is per-declaration, not shared merely because names match. It is explicitly not an ambient/native host-authenticity proof.
- `test/agent1-lexical-reference-resolver.test.js`: 39 lexical fixtures (including nested sibling and ancestor eval; `with`; catch; named functions/classes; destructuring; `var`/block/switch/loop scopes; ESM/script/CommonJS; class static-block-local var; and non-simple parameter defaults), plus binding-ID and CommonJS controls. The 39 fixtures execute inside one Node test; there are three top-level Node tests total.
- `test/agent1-lexical-typescript-paired.test.js`: 30 reference-context templates evaluated in five distinct wrappers, total **150 comparisons**, against TypeScript's checker using its own virtual source file. Its reference classification is independent of the Acorn resolver. This comparison is deliberately bounded: it tests local-vs-ambient classification and excludes dynamic `eval` and `with` cases where checker symbols alone are insufficient. Dedicated conservative eval/with tests are in the 39-fixture suite.
- `communications/agent3/20261123T1812Z_agent1-bounded-lexical-binding-contract.md`: proposed integration plan, full source/closure effect rules, UTF-16 edit checking, sourceType treatment and specific acceptance gates.

The experimental resolver models scopes, destructured bindings, direct eval ancestor taint with sibling non-taint, `with`, class static blocks, and script/module/CommonJS distinctions. A useful falsifier discovered during implementation is:

```js
globalThis.window = 'ambient';
function f(value = window) {
  var window = 'body';
  return value;
}
f(); // 'ambient'
```

A body-`var` is **not** visible to a non-simple parameter-list default initializer. The first prototype wrongly classified this `window` as a local function binding. Commit `799685873967b55368064ad352e42421b90b2f69` added a separate body-var scope for non-simple parameters, and commit `b66e120046acfd6e5ee85679bba7e3cc35ae3ded` added five regression fixtures (39 total). Named body functions and body-side direct eval were covered separately.

## Pinned validation evidence

All CI below ran the existing manual `manual-validation.yml` focused-test mode with Node 22.23.4 and immutable GitHub source SHA. It does **not** run the complete Node corpus, browser integration, or attacker challenge.

| Run | Source SHA | Test | Ubuntu | Windows | Strict JSDoc steps |
| --- | --- | --- | --- | --- | --- |
| [45237025961](https://github.com/FlareZ123/obfs/actions/runs/45237025961) | `9903c0eb678cb1629b91243e243a7b37ccc22e4e` | Initial 34 lexical cases, 3 Node top-level tests | Passed | Passed | Passed |
| [45237683789](https://github.com/FlareZ123/obfs/actions/runs/45237683789) | `70b7773c7402c2ee0ef2e46008b130dbe3eeef2b` | First TypeScript checker harness | Not established | Failed before checker assertion | Skipped after error |
| [45238326672](https://github.com/FlareZ123/obfs/actions/runs/45238326672) | `4b442e7f44c2263fd1a23be1ecf7abf672a39926` | 150 TypeScript comparisons after Windows fixture-path correction | Passed | Passed | Passed |
| [45238917059](https://github.com/FlareZ123/obfs/actions/runs/45238917059) | `b66e120046acfd6e5ee85679bba7e3cc35ae3ded` | Final 39 lexical fixtures, 3 Node top-level tests | Passed | Passed | Passed |
| [45238924424](https://github.com/FlareZ123/obfs/actions/runs/45238924424) | `b66e120046acfd6e5ee85679bba7e3cc35ae3ded` | Final 150 independent TS comparisons, 1 Node test | Passed | Passed | Passed |

Initial TypeScript harness failure was cross-platform path identity: `program.getSourceFile` was missing because a virtual filename was compared with a literal, differently normalized Windows path. The source correction canonicalizes the local virtual path; there was no observed lexical-binder mismatch in that run, because the checker assertion had not begun.

The final independent checker comparison passed **150/150** reference matches per operating system (one Node test assertion loop) and the 39 fixed-fixture suite passed all three top-level Node tests per OS. The passing JSDoc steps are existing project/external/budget configs; the read-only `workplace/` prototype itself was additionally checked locally with `tsc --checkJs --strict` under Node 22.16.0/TypeScript 5.8.3. The automated existing project configs do not include this new `workplace/` file, which should receive a dedicated strict inclusion before promotion.

## Unresolved obligations

1. This prototype is **not** wired into `src/ast.js`, `src/identifiers.js`, `src/properties.js`, `src/core.js`, or an obfuscation mode. It has no production compatibility or measured 2.5× result.
2. A host-global **candidate** can be patched or shadowed by runtime ambient capability changes. Storage `setItem` and named-property assignment require distinct Web IDL dispatch/value coercion analyses. A lexical proof does not establish either.
3. The recursive AST walker is a bounded research proof, not a complete ECMAScript scope implementation. Annex B block-function ambiguity is conservatively unknown; unsupported scope/effect semantics must remain refused.
4. A source-visible function needs a selective source **and closure-binding** preservation plan; changing a captured outer variable name can silently break a preserved callable even when the function's own bytes are untouched.
5. Existing production stages reparse after VM, native, wasm, property, identifier and string transformations and may inject a host guard. Each enabled stage needs a fresh source/UTF-16 offset and frame-coordinate proof, with a conservative refusal on missing correspondence. Merely hooking the new binder into one pass would be unsound.
6. No adversarial reconstruction barrier or hostile-runtime integrity improvement is demonstrated by resolving lexical bindings. The product release remains **RELEASE-BLOCKED**.

## Recommended next integration boundary

Agent 3's canonical intake remains the single source of integration decisions. Adopt or independently recreate a small read-only lexical resolver with its 39 + 150 regression checks, then combine it with the Storage receiver/actual-callable, DOMString and named setter analyses and the multi-pass source-preservation contract. Freeze one exact candidate source and have Agent 10 execute the comprehensive gate. Avoid interpreting isolated focused greens as release acceptance.

**Recorded:** 2026-11-23T18:31:30.870Z


## Stage 1 API-extension validation, 23 November 18:43 UTC

This section supersedes the earlier three-test-only and JSDoc-coverage descriptions **for the subsequent candidate**. Earlier receipt rows remain accurate for their historical source pins.

Agent 3 reviewed the read-only candidate and required four explicit contracts before considering its lexical stage coherent. Following `communications/agent1/20261123T1828Z_agent3-resolver-review.md` and `20261123T1842Z_agent3-resolver-api-test-review.md`, the same research module now:
1. Exposes `declarations` records carrying declaration nodes, spelling, declaration kind and per-declaration BindingId. Ambiguous declarations return null IDs. Sibling same-name function-parameter bindings retain different IDs.
2. Attaches per-reference syntactic `role` for `read`, `write`, `read-write`, `call`, `construct`, `computed-key` and `export-local`; nested destructuring assignments are marked writes.
3. Shares a function-body binding identity for simple parameter+`var` collisions and both source orderings of `var`+`function` declarations. Non-simple parameter/body `var` collisions return Unknown where independent binding/rename safety is unresolved. A mistakenly broad `BlockStatement` to function-body conversion was caught by the existing fixture and corrected in `508f39bcb87465fd44fab88c3024c71f8d9e7459`.
4. Evaluates `with(object)`'s object expression in its incoming lexical scope; the `with` dynamic scope applies to its body. A case with a host-root object expression returns `free-host-candidate` for that root and Unknown for its use inside the with body.

The read-only prototype and both new tests were added to `jsconfig.external.json` for **automated strict JSDoc checking**, commit `b416b13551671f99429409b6bbb3446690b9703e`. The first gate [45239839763](https://github.com/FlareZ123/obfs/actions/runs/45239839763) exposed four JSDoc implicit-any annotations in research code on Ubuntu and Windows; fixed in commits `22362403c013a6d989dad5773060a0181409218c` and `081f02ebde3f10cfd20b98795077b5144151fe34`. The subsequent [focused 45240121562](https://github.com/FlareZ123/obfs/actions/runs/45240121562) passed on both operating systems with strict JSDoc.

A first declaration/role regression [45240754536](https://github.com/FlareZ123/obfs/actions/runs/45240754536) correctly failed on both systems because the function-body experiment accidentally treated *all* nested block statements as body var scopes. Its prior `var` hoisting fixture diagnosed `free-host-candidate` where a local was required. The correction was pushed and revalidated.

**Final focused test pair, exact source commit `61441e2203a737c32fd40cb2d4c69f4fd6c41ea4`:**
- [Run 45241201721](https://github.com/FlareZ123/obfs/actions/runs/45241201721): Ubuntu **9/9 Node top-level tests passed**, Windows focused job passed, 39 lexical fixtures plus declarations, references, role matrix, scope merge and with receiver controls. Existing strict project/external/budget JSDoc gates passed. Full Node 22 job deliberately skipped.
- [Run 45241210599](https://github.com/FlareZ123/obfs/actions/runs/45241210599): Ubuntu and Windows independent **150/150 Acorn–TypeScript declaration-resolution comparisons** in one top-level Node test; strict JSDoc passed, full Node job skipped.

The proposition supported is a **bounded read-only lexical binding-reference analysis** for the enumerated AST and source-type examples. It remains outside all production obfuscation modes and does not prove native host identity, all ECMAScript scoping, selective source/closure integrity, or any adversarial/performance gains. The product remains **RELEASE-BLOCKED**.


## Runtime-alias direct eval correction, 19:15 UTC

A static resolver must treat a syntactic `eval(...)` call as potentially intrinsic direct eval **even if the identifier `eval` is shadowed by a function parameter or local binding**. Native Node confirms:

```js
function f(eval) {
  eval('var window = 37');
  return window;
}
f(globalThis.eval); // 37
```

The earlier prototype used `findBinding(scope,'eval')` as a reason to skip direct-eval dynamic-scope taint when the name was shadowed. That is unsound because the effective callable can still be the intrinsic eval function. Without a caller-value proof, the resolver must conservatively mark the function activation and its lexically nested closures as `unknown` for affected name resolution, while preserving independent sibling scopes. Removed the shadow-name shortcut in `workplace/agent1-lexical-reference-resolver.js`, commit `34f6f7dddb9ebcc6132917dc9de58f85992c1665`. The existing `f(eval)` test now expects Unknown; a new native-execution/regression test checks intrinsic alias behavior; one new nested closure fixture brings the bounded fixture total to **40**; tests commit `9104500e654928f89920b5e7020bc85c0adfba29`.

**Source-pinned final focused two-platform verification, pin `9104500e654928f89920b5e7020bc85c0adfba29`:**
- [45246739289](https://github.com/FlareZ123/obfs/actions/runs/45246739289): 10/10 lexical resolver Node test groups PASS on Ubuntu and Windows, including 40 fixture loop and runtime-alias direct eval control.
- [45246747266](https://github.com/FlareZ123/obfs/actions/runs/45246747266): 150 independent TypeScript binding comparisons PASS on both.
- [45246753216](https://github.com/FlareZ123/obfs/actions/runs/45246753216): 12/12 exact-source/closure constraints PASS on both.

All three workflows passed the existing strict project/external/budget JSDoc steps, and the full Node suite was skipped by focused mode. This correction closes a concrete read-only *proof-admission* hole. It does not assert correctness of the current production compiler, an actual native dispatch detector, or adversarial reconstruction resistance. The overall release remains blocked.
