# External numeric ToPrimitive can expose transformed function source

**Status:** intermediate empirical finding and unmerged conservative candidate; not an established result.  
**Date:** 23 November 2026  
**Branch:** `agent3/external-unary-coercion-observer-20261123`  
**Candidate source commits:** `aef4124192df77f39466edb7e5290b46a38a1cfb` (numeric coercion), `11be85a9f76d86c4db3925be41509f8d0e2519da` (opaque external-call escape), and `f3fd07a828cc6c996b5fd930f8b7a8bd00a7bd3a` (opaque .call/.apply/.bind aliases). Current branch head: `1b5ca00aa49322d37b1f42452ea44a6b6eadc04f`.

## Question

Can an external dependency that is not included in the obfuscator's input file group observe a local function's exact source through implicit numeric coercion, causing identifier mangling to change behavior even though the application source contains no direct `Function#toString` call?

## Counterexample

The application imports an unlisted bare ESM dependency `patcher`. Its module initializer replaces `Function.prototype.toString` with a wrapper that calls the saved native implementation, records the returned source string in `globalThis.__functionSources`, and returns it unchanged.

The application then declares:

```js
function reader(secretValue){return secretValue+1;}
install();
export const coercionIsNaN=Number.isNaN(+reader);
export const capturedSource=globalThis.__functionSources[0]??'';
```

The obfuscator receives only `app.mjs`; the `patcher` package is installed in the execution fixture but is not part of the input file group. Unary numeric coercion applies ToPrimitive to the function object. The default function primitive conversion invokes `Function.prototype.toString`; the patched method captures the source before numeric conversion discards it into `NaN`.

Original and transformed numeric results both remain `NaN`, but the external dependency observes different source text. Current identifier mangling changes the parameter `secretValue` to a generated name.

## Reproduction evidence

- **Run 45271859768:** minimal unary-plus witness was RED on Ubuntu and Windows. The external patcher captured `function reader(secretValue){return secretValue+1;}` before transformation and `function reader(_v1c41336a235a){return _v1c41336a235a+1;}` after transformation.
- **Run 45272400558:** expanded pre-fix matrix was RED on both OS across 18 coercion contexts, including unary and binary numeric operators, update/compound assignment, `Math.abs`, `Number`, `isNaN`, and `parseInt`.
- Node 22.16.0 local semantics control confirmed that `fn + ''` exposes the native function source as a string while `+fn` yields `NaN`; the latter still invokes the patched `Function#toString` before the source is discarded.
- The application AST contains no `Function.prototype.toString` reference. The source observer must therefore account for implicit ToPrimitive effects, not only explicit source-reader calls.


## Expanded baseline and opaque-import return-flow witness

The 55-case matrix was also run against a test-only branch based on unmodified current-main compiler source (`agent3/proxy-observer-baseline-20261123`):
- **Run 45277861598:** RED on Ubuntu and Windows. It reports 50 failed source-observing contexts out of 51; the existing string-concatenation source-observer case (`reader+''`) is already covered by the pre-existing `BinaryExpression +` guard, and the four non-coercive controls pass. This separates the newly missing numeric/alias cases from the already-covered string coercion.
- **Run 45277740099:** a local Proxy whose generic `Reflect.get` trap binds target methods is GREEN on both OS even on the baseline branch. This variant was already caught by existing reflective source-observer logic and is not a new regression.

A distinct unlisted-import boundary does fail on baseline. The app imports `wrap` from an unlisted `proxy-package`, passes local `reader` to it, receives a function Proxy, then evaluates `+proxied`. The external factory uses a generic `Reflect.get` trap that binds function-valued properties to the target; a host preload patches Function#toString and captures the target source.

- **Baseline run 45277989112:** RED on Ubuntu and Windows; transformed capture contains a renamed parameter instead of `secretValue`.
- The candidate now treats function-bearing arguments passed to opaque imported/namespace/require callables as source escapes, because the external implementation may retain, wrap, coerce or stringify them. It tracks direct imports, aliases, bound aliases, `.call/.apply/.bind`, and `Reflect.apply`. This is conservative: unresolved imports are effect-opaque even if their implementation is actually pure.
- Direct candidate witness run **45278782901**: GREEN on both OS.
- Expanded direct/call/apply/bind/bound-alias/Reflect.apply matrix run **45279689540**: Ubuntu GREEN; Windows was still in progress at report update. A later checkpoint must update this status before treating it as fully validated.

The test files are `test/agent3-proxy-numeric-source-observer.test.js` (baseline already green) and `test/agent3-external-proxy-factory-source-observer.test.js` (new opaque-import escape). The candidate's source-escape guard is an interim fail-closed rule; a future module/effect graph should analyze supplied imports interprocedurally and only treat unresolved external callables as opaque.

## Candidate correction

The branch adds a conservative source-observer guard in `src/ast.js` for function-capable values in:
- unary numeric operators `+`, `-`, `~`;
- binary numeric arithmetic and bitwise operators;
- increment/decrement and compound numeric assignments;
- direct `Number`, `isNaN`, `isFinite`, `parseInt`, and `parseFloat` calls;
- direct `Math` numeric methods, `Date.parse/UTC`, `Number.parseInt/parseFloat`, and `new Number` / `new Date`;
- tracked namespace/function aliases, destructured methods, bound numeric coercers, `.call/.apply`, and `Reflect.apply`.

The expanded test `test/agent3-to-primitive-source-observer-matrix.test.js` contains **55 cases**: 51 source-observing coercion contexts and four non-coercive positive controls (`Boolean(reader)`, `typeof reader`, `!reader`, and `reader===reader`). For observing cases it requires the emitted source to remain byte-identical and `metrics.bindings === 0`; for positive controls it requires real identifier yield and an unrelated private binding rename.

- **Run 45273694113:** initial 38-case matrix passed on Ubuntu and Windows, including strict project and external JSDoc.
- **Run 45274361383:** same matrix plus unrelated-private-yield assertions passed on Ubuntu and Windows, including strict project and external JSDoc.
- **Run 45274781741:** expanded 55-case matrix (including aliases, constructors, `.call/.apply/.bind`, and `Reflect.apply`) passed on Ubuntu and Windows, including strict project and external JSDoc.

After adding the opaque-import escape rule, the 55-case numeric matrix passed both OS in run 45279091108. The same 55-case matrix was rerun after the final opaque call/apply/bind alias extension and passed both OS with strict JSDoc in run 45280246940. After the final opaque call/apply/bind alias extension, the existing `function-source-coercion-matrix`, `primitive-coercer-source-precision`, and `source-observer-coverage` suites passed both OS with strict JSDoc in runs 45280032778, 45280039344, and 45280045204. The nine-form external proxy-factory matrix passed both OS with strict JSDoc in 45279689540.

The candidate is on this branch only. No production change has been merged to `main`.


## Property-pass yield consequence

A separate control isolates the same whole-file boolean cost in the property pass. The observed function `reader` is independent of a private object `unrelatedOwner`; its numeric coercion is observed by the unlisted patcher, but the unrelated object's key is not part of the observed function source. With the candidate guard, `metrics.properties === 0` and `unrelatedPrivate` remains unchanged. Replacing numeric coercion with `Boolean(reader)` is a non-coercive positive control: the property pass renames `unrelatedPrivate` and preserves runtime result 17.

- Test: `test/agent3-to-primitive-property-yield.test.js`
- Run 45275533166: initial unrelated-key control GREEN on Ubuntu and Windows.
- Run 45277156645: strengthened version GREEN on Ubuntu and Windows with strict project/external JSDoc; it also asserts that `observedKey` inside `reader` remains present in the captured function source.

This confirms that the boolean observer blocks unrelated property yield as well as identifier yield. The candidate is safe but materially overconservative; a callable/source-span summary is the intended next step, not a global boolean merged as a final solution.


## String-pass yield consequence

A separate host-preload fixture isolates the string pass from the unresolved-import/distributed-source guard. The obfuscated input contains no import: a Node `--import` preload, outside the input file group, patches `Function.prototype.toString`; app code clears the capture array and evaluates `+reader`. An unrelated top-level string literal is not inside the observed function source.

With numeric coercion, the candidate observer vetoes string encoding (`metrics.literals === 0`) and the unrelated literal remains verbatim. Replacing `+reader` with `Boolean(reader)` is a non-coercive positive control: the string encoder transforms the unrelated literal (`metrics.literals >= 1`) and runtime value remains identical.

- Test: `test/agent3-to-primitive-string-yield.test.js`
- Run 45276779305: GREEN on Ubuntu and Windows with strict project/external JSDoc.

The earlier import-based attempt (45276567469) did not isolate this pass because the unresolved import itself triggers the separate distributed-source veto; it was a fixture-design failure, not evidence about the numeric guard. The preload test removes that confound.

## Interpretation and limitations

This is an empirical compatibility failure under a concrete unlisted dependency, not a confidentiality guarantee or a claim that obfuscation defeats DevTools. The source observer's current boolean API makes the candidate fail closed for the entire file. That preserves observed source, but it suppresses unrelated local identifier/property yield. Agent 12 independently measured this whole-file-veto cost in `im-results/source-observer-file-wide-veto-2026-11-23.md`.

The four positive controls show that non-coercive uses of a function do not trigger this guard and still allow identifier yield. They do not establish a complete source-observer model.

Not yet covered:
- arbitrary user-defined `Symbol.toPrimitive` / `valueOf` hooks and proxies;
- aliases assigned after declaration, computed dynamic aliases, and all reflective/constructor indirections;
- unknown object values that may contain functions or custom coercion hooks;
- source observation in cross-file function aliases, browser host preloads, or SCO request-time partitions;
- interactions with string/array/typed-array coercion, stack traces, source maps, and other source readers beyond the existing suites;
- the performance and yield cost under the complete test suite and the 2.5× runtime budget.

## Required next direction

Do not merge the boolean guard as a complete solution. The safer architectural target is a binding-aware `SourceObservationSummary` that identifies the function value(s) whose source may be observed and the corresponding source spans. Identifier and property passes should preserve names and property spellings inside those spans while retaining unrelated private yield; when function identity or span cannot be proven, retain the current whole-file fallback. This should compose with Agent 12's Storage callable-span work and the Stage 1 lexical BindingId resolver rather than introduce a parallel partial identity system.

The candidate should next be peer-reviewed, exercised against existing source-observer/primitive-coercer tests, and then tested with a scoped-yield acceptance fixture. No comprehensive mainline acceptance claim is made here.
