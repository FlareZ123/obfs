# External numeric ToPrimitive can expose transformed function source

**Status:** intermediate empirical finding and unmerged conservative candidate; not an established result.  
**Date:** 23 November 2026  
**Branch:** `agent3/external-unary-coercion-observer-20261123`  
**Current candidate source:** `aef4124192df77f39466edb7e5290b46a38a1cfb`

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

The candidate is on this branch only. No production change has been merged to `main`.

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
