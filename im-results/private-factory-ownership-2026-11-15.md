# Private factory-returned object ownership and cross-file key rewriting

**Agent 16, 2026-11-15. Intermediate compiler experiment with a negative source-reconstruction control.**

## Construction

The existing AST property pass rewrote literal own keys only when an inert object literal directly initialized a private const. This change admits a narrow, previously unhandled ownership path:

```js
function makePrivate(){return {secretField:17,otherField:5};}
const owner=makePrivate();
console.log(owner.secretField+owner.otherField);
```

The local proof in `src/properties.js` now uses `singleUseFactoryObject(ast,bindings,expression)` for a private, top-level, synchronous, non-generator, zero-argument factory, either a function declaration or an immutable const arrow/function expression. The function must directly return one inert `ObjectExpression` and its binding must have exactly one call reference in the module. A single direct `const owner=factory()` holds the resulting object. Candidate keys remain unique ordinary literal own-property initializers, and the existing `proveLocalObject` checks the owner/aliases/reads, interprocedural forwards, source-observation guard, reflection and escapes. The helper is reused by the opt-in closed-world ESM property proof.

With `closedWorld:true`, `src/cross-properties.js` additionally admits `export const shared=privateFactory()`. The factory's returned literal keys are rewritten in the exporting module and all statically proven import consumers (including a verified imported readonly reader). The caller promises a complete declared ESM consumer graph; noncanonical/dynamic imports, namespace consumers and unknown reflection lead to refusal. The transformer does **not** make an external factory private or treat an arbitrary call result as an owned object.

## Real emitted samples and reproducibility

- [One-file before/after SNO CommonJS sample](../examples/factory-ownership/README.md) with a locked atomic generator and byte-exact `--check`; two owner keys rewritten, native module result `22`.
- [Two-file before/after COO ESM sample](../examples/factory-cross-file/README.md) with `state.mjs`, `entry.mjs`, an explicit closed-world compiler configuration, deterministic seed `cross-factory-v1`, and locked atomic/check generator. It rewrites both `secretField` and `otherField` in the exporting factory and in its importing consumer. Native program output remains `22`.
- [Local three-mode regressions](../test/factory-object-flow.test.js) and [native cross-file ESM regressions](../test/cross-file-factory.test.js): declaration/arrow/function-expression positives, tracked aliases and destructuring, imported reader, second factory call/exported factory/namespace import/opaque dynamic keys/reflection/result escape/optional invocation refusals. Actual native Node subprocesses execute original, rewritten, and seedless-normalized ESM files.

The compiler's hashes are distinct seeded truncated SHA-256 output strings (`_p` plus hex); compiler seeds are not hidden cryptographic runtime keys. The [independent attacker token normalizer](../sims/attacker-token-normalize.js) sees only distributed files and removes both generated field labels while preserving native ESM output. In the 3 positive cross-file factory variants tested, the attacker normalized **2/2 private keys per graph**. This directly falsifies claims that these emitted hashes prevent static program reconstruction.

## Measured validation and runtime cost

A **fully green manual Linux/Windows run** [43731822106](https://github.com/FlareZ123/obfs/actions/runs/43731822106) was pinned to immutable source `b20402eeeaee6af9df7d5b4c8506458584f8b7d2` (the new cross-file regressions and before/after sample). Both Node.js 22 jobs reported **903 tests passing, 0 failing, 1 skipped of 904 total**, core and external JSDoc typechecking passing, and the sampled benchmark within its configured 2.5× ceiling. Ubuntu also passed the existing native headless Chromium fixtures. These tests are finite, and they cannot prove compatibility with every JS program or browser.

The two explicit `test/benchmark.js` factory-owner hot loops each require two private-field renames and execute one million repeated property reads per timed iteration, with 15 warmups and 9 paired samples. Their median obfuscated/native ratios in this run were:

| Tested workload | Ubuntu Linux | Windows |
|---|---:|---:|
| Single-use function declaration factory | **0.999×** | **1.005×** |
| Single-use immutable arrow factory | **1.010×** | **1.006×** |

The graph factory initialization itself is not separately budgeted or benchmarked; on these tests the transformation rewrites labels and adds no runtime decoder. Across arbitrary application programs, 2.5× is not established. Cold process startup, external host effects, arbitrary recursion and unknown nested callbacks are outside this measurement. A previous [red full run 43730702783](https://github.com/FlareZ123/obfs/actions/runs/43730702783) exposed nondeterministic `Date.now()` oracle comparison and CRLF snapshot mismatches on Windows, repaired before the green run. The unrelated COO piggyback sample was also normalized for cross-platform snapshots, and Agent27 was notified.

## Independent threat-model dimensions

1. **Static program reconstruction:** Source-only key normalization is successful in the tested cross-module positives. Key spelling diversity is narrow AST coverage, not measured protection of algorithm semantics.
2. **Dynamic instrumentation/extraction:** All rewritten COO/SNO source is delivered to the modeled adversary. A debugger can inspect the runtime objects and replace the loaded program. No anti-instrumentation guarantee is introduced.
3. **Modification/integrity:** This compiler pass adds no cryptographic signature, immutable trust anchor, or tamper-proof enforcement.
4. **Authorized environment:** Host checks retain their existing advisory scope. Factory renaming does not bind execution to an authorized URL or server.
5. **Compatibility/performance:** Selected two-file Node ESM and single-file CommonJS cases are differential-tested. Factory purity, ownership, import world, and external source-introspection are necessary proof constraints; performance ratios apply only to the measured loops.

## Decision and limitations

Keep the change as a **compatible, measured ownership-proof coverage extension**. Do not promote to `results/` as a novel deobfuscation-security result. The specific proof permits one-use private factory literals; it declines general factory closures, dynamic keys, mutable/escaped aliases, and externally source-inspected callbacks. As documented by earlier [opaque-host source-contract witnesses](opaque-external-source-contract-2026-11-15.md), arbitrary injected observers can still inspect altered `Function#toString` and stack positions without source-level syntactic hints. Future held-out adversarial tests should exercise those contracts and multiple runtime/alias forms.

Support: source commits `e3a943b0` through `342f00ae`, deterministic native tests and real generated artifacts at `b20402ee`, independent static normalizer, and pinned run `43731822106`.
