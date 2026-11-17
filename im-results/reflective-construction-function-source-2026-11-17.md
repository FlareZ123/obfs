# Reflective native construction and RegExp flags as implicit function-source observers

**Agent 3, 2026-11-17.** Scope: source-observation proof correctness, not an established obfuscation-security gain. Source after the bounded repairs: `7872c87deab926e7e41ee6e20e41da9209e8a14b` (compiler AST logic committed in `ec5e86d34ba9e89d9efa6f105afa7f5ecea35d77`).

## Reproducible semantic witness

JavaScript's native `Reflect.construct(target, args)` forwards the supplied array to `target`'s constructor. Native `RegExp`, `String` and `Error` may implicitly ToString-coerce a function object and reveal its original source spelling. `RegExp` also ToString-coerces a **second flags operand**, even when the first pattern is a known primitive. V8's invalid-flags `SyntaxError.message` includes the entire function text.

Representative original input:

```js
function protectedLabel(x) { return (x ^ 137) & 255; }
const pattern = Reflect.construct(RegExp, [protectedLabel]).source;
let diagnostic;
try {
  RegExp('abc', protectedLabel);
} catch (error) {
  diagnostic = error.message;
}
```

Renaming `protectedLabel` changes both `pattern` and `diagnostic`; preserving only the function's computation is insufficient for 1:1 behavior. This is supported by the [ECMAScript RegExp constructor definition](https://tc39.es/ecma262/2026/multipage/text-processing.html), [Reflect.construct reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/construct), and [V8 invalid-flags diagnostics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Bad_regexp_flag).

## Failure mechanism and bounded implementation

Earlier `observesFunctionSource` handled direct native coercion and some `Reflect.apply` calls, while failing to recognize `Reflect.construct(RegExp, [fn])` and `RegExp('abc', fn)`. A detected observable source boundary causes the conservative compiler to retain source spelling; missing it admits transformations that risk changing public outputs.

The repairs in `src/ast.js`:

1. Track `Reflect.construct` aliases through assignment, local namespace aliases, global member access, object-pattern extraction and simple bound aliases using the established monotone fixed point.
2. Inspect forwarded constructor argument lists through direct calls, `.call`, `.apply`, `.bind`, and nested `Reflect.apply(Reflect.construct, ...)` invocations.
3. Check both `RegExp` pattern and flags for values whose primitive status is unproved; preserve earlier single-text-argument checks for `String` / `Error`.
4. Accept known primitive-only argument arrays without triggering the source-observer guard. Opaque argument lists intentionally overrefuse.

Tests: `test/reflect-construct-function-source-observer.test.js` (18 case variants and primitive control), `test/regexp-flag-function-source-observer.test.js` (14 variants and primitive control), and `test/reflect-construct-interfile-source.test.js` (two cross-file source observers and one unrelated positive private key transformation). CJS tests check original and COO/SNO compiler-emitted behavior; ESM tests execute a real Node linker in independent temp directories and include original and transformed results.

## Evidence and exact source accounting

A fresh native V8/Node-compatible Acorn AST re-evaluation of actual fetched `src/ast.js` versions found:

| Variant group | Distinct cases | Source-observer result before | Result after |
| --- | ---: | --- | --- |
| Direct and aliased `Reflect.construct` | 11 | 11 false at `8df237c` | 11 true at `9ce19a8` |
| RegExp second-operand flags | 10 | 10 false at `9ce19a8` | 10 true at `bc64cd3` |
| Indirect `.call` / `.apply` / `.bind` / nested `Reflect.apply` constructor paths | 7 | 7 false at `bc64cd3` | 7 true at `ec5e86d` |
| RegExp flags through indirect constructor paths | 4 | 4 false at `bc64cd3` | 4 true at `ec5e86d` |

All 32 latest variants additionally produced the expected function text under direct native evaluation; the primitive-only controls were excluded from source observation by the final AST checker. These are **isolated proof checks**; the corpus remains finite.

At pinned earlier source `a215e7d5372386559da1cde75eb268317b3e0a6b`, [CI run 44117482707](https://github.com/FlareZ123/obfs/actions/runs/44117482707) passed nine targeted tests on Ubuntu/Windows, project and external strict JSDoc, CPU benchmark samples on both operating systems, and Ubuntu Chromium integration. A follow-up complete [manual-validation run](https://github.com/FlareZ123/obfs/actions/runs/44118786016) was dispatched at `7872c87` to validate the additional 11 indirect cases. Its final status must be separately checked. The initial pinned cross-platform CI at `89561df` also passed the direct targeted tests.

**Acceptance caveat:** The full repository Node suite is not green at `a215e7d`. A concise run reported 2,542 passes, five failures, one skip across 2,548 tests. All five failures were positive protected-yield assertions (not functional differential mismatches): application own-key 2/2 expected but 0, application token normalization 2/2 expected but 0, three-file imported ESM reader 1 expected but 0, independent public field-name recovery 2 expected but 0, quoted ESM ordinary string encoding expected but 0. These failures require separate provenance and repair before a full gate may be claimed; workflow `continue-on-error` only kept independent checks running.

## Security and proof limits

- This avoids specific source-spelling miscompilations. It does **not** increase static or runtime extraction resistance by itself.
- Conservative source-observer flags can refuse an entire file graph. A safe decline can decrease the transformed fraction of protected work; anti-vacuity must be scored independently.
- The proof is syntactic and finite: unknown native constructor aliases, cross-realm intrinsics, monkey patches, and runtime-replaced Reflect/RegExp remain open.
- The published 2.5× CPU ceiling is **not established universally** by sample benchmark success.
- Source-origin notes and exact SHA comparisons above are compiler analysis results. Node and Chromium differential results from CI must be cited separately from these AST-only checks.

## Next useful research

Reduce false source-observer refusals with demonstrated, source-visible cross-file primitive-value proofs, and require a frozen unchanged positive-control program alongside any new guard. In particular, an imported binding used in `console.log` can be treated as opaque/function-capable without whole-graph value provenance, which can block otherwise proven cross-file renames. Maintain independent static normalization and hostile-client attacks; neither is solved by semantic guards.
