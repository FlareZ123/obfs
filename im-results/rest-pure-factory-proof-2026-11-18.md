# Recovering proven pure local factory values through rest-vector provenance

**Date:** 2026-11-18. **Status:** intermediate semantics/transform-yield evidence, not an attacker-resistance result.

## Context and problem

After [PR #76](https://github.com/FlareZ123/obfs/pull/76) conservatively refused unknown `CallExpression` results entering `...rest` or implicit `arguments` vectors, a safe local `const scalar=()=>7; void count(scalar());` was also refused. The opaque call-result issue had four proven unsafe branches, so blindly relaxing the guard to all `fn()` calls is unsound. The useful narrower question is whether a source-local immutable, zero-argument function that **syntactically always returns an inert primitive expression** can retain the owner's private-key rewrite.

The test-only exact source `0670207a859196a7c9007e8d05a2327b5a8eeb22` ran via [Ubuntu/Windows 44205314325](https://github.com/FlareZ123/obfs/actions/runs/44205314325): **3 of 43 targeted Node ESM tests failed on each OS**, all from required positive private rewrite counts. The other 40 tests passed, including the three adversarial new controls (mutable factory assignment to `globalThis`, direct immutable arrow returning `globalThis`, and shadowed duplicate `const` binding).

## Bounded proof

The candidate at compiler SHA `48a3d92dae468cea16ee803203c35e1350e13a56` reuses the existing pure-literal expression proof and only admits the call result if **all** conditions hold:
- Source-local unique top-level `const` binding, initialized by an actual zero-argument `ArrowFunctionExpression` or `FunctionExpression`.
- Function is synchronous and non-generator, with a concise source-proven primitive expression or a sole `return` statement returning one.
- Caller actual expression is a direct `fn()` with no optional call or arguments, used as an argument to a known rest/arguments vector at a top-level expression statement (a `void` wrapper is allowed).
- Its call appears after the `const` initialization in source order. This avoids approving a callable while its lexical declaration is in the temporal dead zone.
- Any unknown call, object/array result, non-constant return expression, mutable or shadowed factory remains refused. No source function is executed during proof and the original expressions, evaluation order and emitted runtime logic remain unchanged.

The function-valued local binding is immutable, but this is not a universal static effect proof, and only this strict source-level lexical context is claimed. The tiny positive fixture must report one genuinely renamed exported owner field and match native Node ESM output.

Official JavaScript semantics background: [MDN const declaration](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const) for lexical immutability/temporal dead zone, and [MDN arrow functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions) for lexical bindings.

## Validation and limits

**Pinned source status:** the two-platform transformation-semantics workflow validating exact `48a3d92` was dispatched and is pending final status. The full current-main integration must be separately tested before merging.

This is a **protected-work admission/compatibility** improvement. It does not make minification harder to reverse, protect private functions under COO or SNO hostile runtime control, bind a client to a domain against a fully instrumented attacker, or prove universal 2.5× runtime compliance. No security-positive result is claimed.

Reproduce focused cases with `node --test test/closed-record-host-formal-provenance.test.js`. The CI workflow `.github/workflows/manual-transform-safety.yml` exercises this file before the broad source-observer, property safety, strict JSDoc, browser and cost-related gates.
