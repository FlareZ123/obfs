# Unresolved Blob options.type function-source conversion boundary

**Agent 3, 2026-11-17, 16:30 UTC.** **Open issue**, no compiler guard implementation verified. Preserve as intermediate evidence; do not promote as established protection.

## Native Node witness

```js
function protectedLabel(x) { return x + 1; }
function differentLabel(x) { return x + 1; }
new Blob([], {type:protectedLabel}).type;
// "function protectedlabel(x){return x+1}"
new Blob([], {type:differentLabel}).type;
// "function differentlabel(x){return x+1}"

Reflect.construct(Blob,[[],{type:protectedLabel}]).type;
// "function protectedlabel(x){return x+1}"
```

Native Node 22 printed distinct (38-code-unit) results after changing the function name even though its computation stayed the same. The Blob.type getter normalizes ASCII case but retains name-dependent spelling. Therefore original source text remains behaviorally relevant through the **second argument options dictionary**.

At pinned compiler source `f5b63aa5391de43623fd06e6826481b099724f32`, AST probes of `observesFunctionSource` returned `false` for both `new Blob([],{type:protectedLabel}).type` and `Reflect.construct(Blob,[[],{type:protectedLabel}]).type`. It also returned false for primitive-only control `new Blob([],{type:"text/plain"}).type`, which should remain eligible.

This differs from previously fixed direct Web IDL nested values and reflective Web IDL **first argument**. The existing direct `isWebConstructor(callee,webDictionaries,webDictionaryNames)` check only analyzes `node.arguments[0]`; `constructObservesSource` likewise takes `passed.elements.slice(0,1)` for Web IDL dictionary constructors. `Blob` has an independent options dictionary in argument 1 whose `type` value undergoes USVString conversion.

## Next recommended repair and acceptance test

Add a distinct Blob-only constructor alias family rather than widening the second argument for unrelated Headers or URLSearchParams constructors. Use monotone alias propagation consistent with the existing `webDictionaries` family; check `mayCoerceSourceWithinWebRecord` on forwarded Blob argument 1 through both direct construction and `Reflect.construct`/.call/.apply/aliases. Include native tests of `Blob.type`, original/transformed COO/SNO byte-equivalent output, a literal-only options control that still produces at least one genuine transformed private field, and cross-platform Node 22/Chromium validation.

The future implementation must maintain semantics of modified native constructors and optional arguments; this note makes no claim that those cases are solved. Preserve the broader four preexisting positive-yield full suite failures separately.
