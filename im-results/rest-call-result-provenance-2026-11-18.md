# Opaque call-result provenance in rest and arguments vectors

**Date:** 2026-11-18. **Classification:** bounded native/compiled semantic safety, not a strong-obfuscation or anti-relay claim.

## Why the previous guard was insufficient

The previous [rest/arguments ambient fix](rest-arguments-ambient-mainline-repro-2026-11-17.md) checks syntactic ambient identifiers inside actual expressions. This catches `rewire((0,globalThis))`, array/object literal carriers and aliases already proven to contain `globalThis`. It cannot establish that the *value* returned by a user function call is unrelated to the ambient global. A call such as `rewire(root())` can provide `globalThis` while the call expression itself mentions only `root`.

## Exact counterexample

The four additional real ESM test variants in `test/closed-record-host-formal-provenance.test.js` call an effectful rest-parameter function with a value returned by (1) a local declared function returning `globalThis`, (2) a local arrow function returning `globalThis`, (3) an owner-like capability container accessor, or (4) a forwarding function that invokes another local function. The downstream function mutates host `Reflect.ownKeys` so the original and transformed program reveal their field spelling.

At the test-only source SHA `cf35d527cd6a29a39320cd8f5d5c82753979dce2`, [Ubuntu and Windows transformation workflow 44203561997](https://github.com/FlareZ123/obfs/actions/runs/44203561997) failed **four of 36 targeted Node ESM tests on both platforms**. In each real subprocess, native `['secretField']` differed from compiled `['_p...']`. The other 32 tests, including a safe one-key-positive, passed. This establishes a defect under the stated closed ESM source graph, independent of static attacker-cost assumptions.

## Candidate soundness boundary

The candidate `src/cross-properties.js::safeClosedCallerRecordRead` admits values passed into unresolved `...rest` and implicit `arguments` vectors only if their argument AST proves an inert primitive result. The existing `isLiteralValue` proof handles primitive literals and pure arithmetic, conditional and interpolated primitive expressions; object/array literals, RegExp, arbitrary identifiers, getters, and calls are conservatively refused. The original code is neither evaluated during analysis nor rewritten by the guard. This rejects the four demonstrated call-result escapes even when their source functions do not syntactically spell a known ambient identifier at the callsite.

The first repair at compiler SHA `6c4f23c7c33bfadb782aadf7345257a2fa0e4131` passed [full Ubuntu/Windows transformation semantics run 44203874716](https://github.com/FlareZ123/obfs/actions/runs/44203874716), including the 36 targeted Node ESM native/generated comparisons, original scalar positive owner-key rewrite, strict JSDoc checks, further semantic/source observer tests and sampled profiles. A further explicit positive `count((2*3)-1,1<<3,typeof 7)` regression requires one actual protected key rename; it was added in a later test-only commit and needs its own source-pinned validation.

The admissibility rule is intentionally conservative and may decline safe applications with locally evaluable function returns, imported immutable value identifiers, or containers. It is not a complete interprocedural may-alias lattice; this source-aware scanner still assumes an appropriate trusted host-intrinsic contract. For COO/SNO, a fully controlling attacker retains instrumentation and can bypass local host checks. Nothing in this patch establishes source secrecy, anti-LLM resistance, a 2.5× universal runtime bound, or SCO anti-relay confidentiality.

## Reproduction

Run `node --test test/closed-record-host-formal-provenance.test.js` for exact original/generated ESM comparisons; the manual `.github/workflows/manual-transform-safety.yml` first executes that test, then runs broader compiler checks and both strict JSDoc configurations on Ubuntu/Windows. Both red and green exact source commits are retained in GitHub history, with no need to trust a source-level explanation alone.

**Expanded positive-control validation:** [two-platform manual transformation safety run 44204394859](https://github.com/FlareZ123/obfs/actions/runs/44204394859) completed **success on Ubuntu and Windows Node22** at exact compiler + test source `8bfecad6d33bd59f2a61202e6c52a6cf1383f30e`. Both jobs include all **37 targeted ESM native/generated regression cases**, the prior 36 and the real one-key rewrite from arithmetic rest actuals, broad source-observer and property tests, strict JSDoc and sampled profiles. This is a scoped semantics/protection-yield gate; full current-main Linux/Windows/Chromium integration remains pending.
