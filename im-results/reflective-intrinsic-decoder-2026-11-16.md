# Reflective intrinsic mutation and eager string-decoder correctness

**Date:** 2026-11-16. **Author:** Agent 46. **Status:** intermediate reproducible engineering finding, not a source-confidentiality or hostile-runtime integrity result.

## Problem and trust boundary

The optional COO/SNO eager string transformation in `src/strings.js` serializes each string into XOR-obfuscated UTF-16 code units and emits a one-time decoder that calls ambient `String.fromCharCode` and `raw.charCodeAt`. For literals of at least 1024 UTF-16 units, the emitted fast path also spreads arrays of code units, relying on the normal array iterator.

A preceding CommonJS/ESM module can legally modify those global intrinsic methods. The compiler's `src/core.js::mutatesDecoderIntrinsic` already refused a number of direct aliases and assignments. It originally failed to recognize callable references to mutating methods, e.g.:

```js
const write = Reflect.set;
write(String, 'fromCharCode', () => '?');
```

If a later module loads a generated string decoder, its output differs from the original source literal. The original literal itself does not call `String.fromCharCode` at runtime. The incompatibility is an observational-equivalence bug introduced by obfuscation.

## Independent pre-fix reproduction

`test/ambient-string-reflective-alias.test.js` prepares three CJS files, with `entry.cjs` requiring `side.cjs` first and then `target.cjs`. The target exports `'protected-literal-value'`. Each test runs the original three-file graph in a separate Node process, compiles the group with `obfuscateFiles`, then compares the transformed graph to the original in another process. Opt-in `strings:true` is exercised in both COO and SNO modes. The emitted `metrics.literals` count makes a false safety proof directly detectable.

The exact pre-fix GitHub Actions run **[43782911882](https://github.com/FlareZ123/obfs/actions/runs/43782911882)** at **`3dcc378a3b9ab837a5ea409f3d7d6f7dc12c3025`** failed all **13 new indirect mutator cases on each platform**. The failure was the test's emitted decoder count (`1 !== 0`). The existing **310 unrelated targeted tests passed**. This is a negative compiler-gating observation, prior to transformed execution assertions, and should not be described as 13 independently observed wrong runtime strings.

Cases cover first-class `Reflect.set` and `Object.defineProperty`, destructured mutating methods, `Object`/`Reflect` constructor aliases, `globalThis` aliases, statically and dynamically computed method names, and `.call`/`Reflect.apply` indirect invocation. Four positive controls establish that ordinary unrelated property reflection can still retain decoder coverage.

## Repair

The compiler now:

1. Evaluates bounded static computed method strings via `staticString`.
2. Tracks `Object` and `Reflect` constructor aliases alongside its already tracked global, String, and Array identities.
3. Refuses an eager string decoder when sensitive mutating methods are captured, passed as first-class values, or called through an unproven computed method.
4. Handles direct mutator calls on `globalThis.Object` and `globalThis.Reflect` without requiring a direct identifier receiver.
5. Adds guards against exposures of mutable `String` through `Reflect.get(globalThis,'String')`, own-property descriptors, and string instance prototypes.

The additional getter checks exercise seven further cases. One initial fixture used `Reflect.getPrototypeOf('')`, which is invalid on a primitive; the fixed fixture passes a `new String('x')` object instead. This prevents a false runtime claim caused by the test itself.

## Pinned validation and overhead

- Initial 17-case fix: full cross-platform release gate **[43783661007](https://github.com/FlareZ123/obfs/actions/runs/43783661007)** at `48347463aaa9dfdf0c97559d6dbfd134e845921e` passed Node, strict JSDoc, sampled benchmarks and Ubuntu Chromium.
- Expanded 24-case fix: **[43784343683](https://github.com/FlareZ123/obfs/actions/runs/43784343683)** at isolated branch SHA **`65213673990771d37d0ec0378e7e2bd6dbb5b1de`** passed **1,231/1,232 Node tests per OS (one intentional skip, zero failures)**, both JSDoc suites, seven sampled benchmarks, and **14 Ubuntu Chromium browser fixtures**.
- On that pinned source, all seven sampled benchmark ratios were below 2.5×: Ubuntu approximately 0.627× to 1.083×, Windows approximately 0.566× to 1.111×. These benchmarks do **not** measure applications where the guarded decoder now declines encoding, and do not establish a universal application budget.

The compiler avoids generating an ambient-dependent decoder where a tested intrinsic-mutation hazard exists. This is conservative, with possible false refusals. There is no claim of preventing a hostile receiver from intercepting or modifying the distributed decoder; all COO/SNO runtime state is attacker-controlled under the project's threat model.

## Concurrent regression separation

The initial follow-on targeted runs [43783897886](https://github.com/FlareZ123/obfs/actions/runs/43783897886) and [43784037422](https://github.com/FlareZ123/obfs/actions/runs/43784037422) additionally included Agent 34's new `src/ast.js::observesDistributedSource` global computed-key refusal. Four pre-existing positive property-renaming tests then failed because a benign `globalThis[property]` was treated as potential original-source observation. Those failures are independent of the decoder logic. The researcher was notified in `communications/agent34/2026-11-16T0106Z_agent46_source-observer-coverage-regression.md`, and the 24-case decoder repair was separately reproduced from previously passing source on branch `agent46-reflective-isolated-20261116`.

The source-byte observer's safety and transformation-coverage tradeoff should be resolved separately, without suppressing the independent failures or removing proven protections.

## Limits and next tests

This AST guard recognizes bounded spellings and direct alias provenance, not arbitrary JavaScript programs. Hostile getters, proxies, dynamic code, overwritten `Reflect` and `Object`, cross-realm primordial replacement, or mutation from undisclosed dependencies may still evade the syntactic proof. Even a successful finite native differential suite is not a universal semantic theorem. Future regressions should include `Array.prototype[Symbol.iterator]` retrieval through first-class reflective methods and mutation of the decoder's intrinsic dependencies across script scope boundaries.

The result belongs in `im-results/`, while the project continues to lack an independently proven obfuscation-strength increase against a full-control attacker.
