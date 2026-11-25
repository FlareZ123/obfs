# Receiver-bound member-flow prototype for getter, method, and side-effect paths

**Status:** intermediate research prototype. Not production-integrated and not an established result about the production compiler.

## Reproduction pins

- Experimental branch: `agent5/member-this-precision-review-20261125`
- Receiver-aware helper: `workplace/agent9-ambient-call-bindingid.js` at `6c5d8c3ef55080d315f6a1116781bb33f3ece586`
- Focused test snapshot: `test/agent5-receiver-bound-return-resolution.test.js` at `6239ce55b9587f4ae207e3cd8ef58629282c8688`
- Validation: [manual-validation run 45622822777](https://github.com/FlareZ123/obfs/actions/runs/45622822777)
- Result: 19 focused tests passed on Ubuntu and Windows, including strict project and external JSDoc checks.

The test source is self-contained: it analyzes each program with `summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs')` and executes relevant examples in Node's VM to verify what the host actually receives.

## What the prototype covers

1. **Direct receiver-bound returns:** object getters and methods returning `this.callback` resolve the callback on the actual receiver.
2. **Primitive precision controls:** getters and methods returning `this.count` do not retain unrelated callable siblings.
3. **Nested static chains:** `this.state.callback` resolves through nested local records.
4. **Prototype receivers:** inherited object getters retain the original object as `this`, including through an identifier alias for the prototype.
5. **Computed and optional access:** literal-computed and optional getter reads are resolved; unresolved computed keys fail closed over receiver callables.
6. **Nested method returns:** `this.getCallback()` and chains through nested receiver methods resolve return expressions, including class getter/method cases.
7. **Side-effect sinks:** a fixed-point receiver map binds local method calls and getter reads to their known receivers, allowing `external(this.callback)` inside those methods/getters to be recognized. Lexical arrow functions inherit the receiver map.
8. **Dynamic getter side effects:** an unresolved computed property read conservatively maps all known getter functions on the receiver, so getter-internal `this` sinks are not silently missed.
9. **Escaped-object lexical returns:** object getters/methods and class-instance methods returning lexically captured callables are covered by the existing held-closure propagation.

## Main technical observations

The earlier failure had two distinct dimensions:

- A missing receiver environment for `ThisExpression` caused false negatives when a getter/method returned a callable from a receiver property.
- A broad fallback that retained every callable on a receiver fixed some method-return false negatives but over-retained unrelated callables when the return was a primitive field.

The prototype uses a receiver-aware value evaluator for direct static member chains and nested local method calls. It preserves a conservative fallback for unresolved paths. Separately, a fixed-point map associates known local method/getter function nodes with receiver expressions discovered from member calls, property reads, nested `this` calls, and lexical arrows. This lets sink analysis resolve this-bound values inside method/getter bodies.

Dynamic getter reads use a broader getter enumeration, deliberately trading precision for fail-closed behavior when the key is unknown.

## Boundaries and unresolved questions

- Class-field deferral remains conservative when accessors or methods are present. The prototype does not yet prove that every class getter/method is side-effect-free, so callable sibling fields may remain host-held even when a getter returns a primitive.
- Arbitrary proxies, reflection, descriptor-defined getters, `Object.create`/prototype factories, mutable prototype replacement, and every function-constructor prototype pattern have not been exhaustively modeled.
- The fixed-point receiver map is based on statically resolvable local calls and property reads. Calls through unknown aliases, dynamic receiver sources, or external frameworks require additional tests and may fall back conservatively.
- Nested normal functions do not inherit `this`; arrows do. The prototype propagates lexical receiver context to arrows, but deeper closure and `super` combinations need additional adversarial coverage.
- The tests validate a research helper's summary and runtime witness, not the production compiler's transform, emitted code, browser compatibility, runtime source-observation behavior, or the full 2.5x performance budget.
- No production `src/` or `bin/` files were changed by this prototype.

## Recommended next validation

1. Compare this evaluator against Agent 6's `objectGetterReturnExpressions` implementation and agree on one canonical receiver abstraction rather than maintaining duplicate helpers.
2. Add adversarial fixtures for proxies, getters created by descriptors, `Object.create`, prototype mutation, `super`, destructuring, nested arrows, function-constructor prototypes, and receiver aliasing across modules.
3. Run the complete ambient-call suite and the source-observation/runtime witness suite on both platforms.
4. Only consider production integration after proving no behavior regressions, no unsafe property rename, and acceptable compile-time/runtime overhead.
