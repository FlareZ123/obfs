# Web IDL string conversion via Reflect.construct is an implicit function-source observer

**Agent 3, 2026-11-17.** Intermediate semantic-correctness result with a native Node reproduction. Compiler improvement commit `71876e7ffcb8ba1f7b86d2446a5c594137480656`; isolated regressions `test/reflect-construct-webidl-function-source.test.js`, latest source-isolated test commit `aea0255fb2595e097ca04453433eff44833ce4bc`.

## Observed native behavior

The WHATWG and Web IDL constructors can ToString-convert their scalar arguments or values within record/sequence arguments. When supplied a function, native conversion exposes its current `Function.prototype.toString` bytes. In Node 22, these examples include:

```js
function protectedLabel(x) { return (x ^ 173) & 255; }
Reflect.construct(URL,[protectedLabel,'https://example.com']).href;
// https://example.com/function%20protectedLabel(...)...
Reflect.construct(DOMException,[protectedLabel]).message;
// function protectedLabel(...) { ... }
Reflect.construct(Headers,[[['X-Name',protectedLabel]]]).get('X-Name');
// function protectedLabel(...) { ... }
Reflect.construct(Event,[protectedLabel]).type;
// function protectedLabel(...) { ... }
```

`Reflect.construct(Request,[protectedLabel])` can also include the original source in its URL parse diagnostic. An attacker-observable error message counts as a behavioral output: renaming `protectedLabel` changes the message. These source observations exist even without an explicit `String(...)` expression in user code.

Earlier `observesFunctionSource` analyzed direct `new URL(fn)`, `new Headers(...)` and similar native uses, while the reflective native constructor path only considered `isCoercer`, which omitted Web IDL constructors.

## Implementation and boundaries

`constructObservesSource(target, passed)` in `src/ast.js` now accepts proven Web IDL scalar, dictionary and record constructor families through the existing `isWebConstructor` analysis. A scalar with an unknown argument refuses; a dictionary checks the first record/sequence input through `mayCoerceSourceWithinWebRecord`; a record uses that recursive check for forwarded arguments. Native `String`/`RegExp` paths retain the existing first-string-argument and second-RegExp-flags checks. The same shared helper handles aliases, `.call`, `.apply`, `.bind`, and nested `Reflect.apply(Reflect.construct,...)`.

Ten isolated Web IDL witnesses were verified against the **preceding** pinned `ce8aa06fbb24ff56b00a019ac871ac70aa751a1b` and the patched compiler `71876e7`: all ten were `observed:false` before and `observed:true` afterward. Matrix: URL pathname; DOMException.message; Headers nested pair value; Request URL error; Event.type; URL constructor alias; detached constructor alias; `Reflect.construct.call`; `Reflect.construct.apply`; nested `Reflect.apply`. A primitive-only Reflect.construct(URL,...) control requires ordinary identifier obfuscation to remain admissible.

The tests execute source and emitted COO/SNO CommonJS through the **native Node realm** because `vm.runInNewContext` does not inject Node's global URL/Headers/Event constructors by default. Native equivalence includes the exact textual error and property results. Full cross-platform Node, sampled CPU, JSDoc, and Chromium status is tracked by pinned [run 44125264945](https://github.com/FlareZ123/obfs/actions/runs/44125264945), which must be checked to confirm final status before declaring that gate passed.

## Boundaries and alternatives

This fixes an identified under-refusal of semantic source observation. It does not demonstrate greater obfuscation secrecy: the safe compiler may decline obfuscation when it cannot prove source output is unaffected. Scope is limited to the known Web IDL API families in `src/ast.js`. Intrinsic replacement, tampered host environments, arbitrary third-party constructors, source maps, and DevTools extraction remain separate threat dimensions. The primary 2.5× runtime ceiling still requires measured full-session workload evidence.

Companion reports:
- `im-results/reflective-construction-function-source-2026-11-17.md`
- `im-results/immutable-esm-primitive-source-proof-2026-11-17.md`
