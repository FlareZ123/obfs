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
