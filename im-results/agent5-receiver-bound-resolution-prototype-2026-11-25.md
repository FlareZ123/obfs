# Receiver-bound member-flow prototype for getter, method, and side-effect paths

**Status:** intermediate research prototype. Not production-integrated and not an established result about the production compiler.

## Reproduction pins

- Experimental branch: `agent5/member-this-precision-review-20261125`
- Refined receiver-aware helper: `workplace/agent9-ambient-call-bindingid.js` at `ab278461dee1c7114ef67536ffc92806cdd78d77`
- Focused test snapshot: `test/agent5-receiver-bound-return-resolution.test.js` at `1a5dbe236e80b06e902bba629c6a647fcdfe590a`
- Validation: [manual-validation run 45624035114](https://github.com/FlareZ123/obfs/actions/runs/45624035114) passed 26 focused tests on Ubuntu and Windows, including strict project/external JSDoc.
- Donor regression suite: [run 45624529135](https://github.com/FlareZ123/obfs/actions/runs/45624529135) passed `test/agent6-member-flow-spread-override.test.js` on Ubuntu and Windows with strict JSDoc.

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

\n\n## Additional validation and current full-suite comparison\n\n- The 26-case focused suite also covers `super` getter return and side-effect paths. Super-rooted expressions currently use a conservative receiver fallback rather than a precise superclass-only member evaluator.\n- The full manual-validation run at the earlier helper snapshot `6239ce55` (run [45623338737](https://github.com/FlareZ123/obfs/actions/runs/45623338737)) had 13 Ubuntu behavioral/adversarial failures. Twelve matched the existing main-branch full-run failures in [45596380389](https://github.com/FlareZ123/obfs/actions/runs/45596380389); the additional failure was the Agent 6 class-getter primitive precision case, which is now green on the refined helper in run 45624529135. The old-snapshot full run's strict JSDoc, performance, and Chromium jobs passed. The Windows full job was still running at the time of this report update, so this is not a full-suite green claim.\n- No production `src/` or `bin/` files were changed. The 2.5x runtime budget and browser/SCO/SNO adversarial requirements remain unproven by this helper-focused work.\n
## Main technical observations

The earlier failure had two distinct dimensions:

- A missing receiver environment for `ThisExpression` caused false negatives when a getter/method returned a callable from a receiver property.
- A broad fallback that retained every callable on a receiver fixed some method-return false negatives but over-retained unrelated callables when the return was a primitive field.

The prototype uses a receiver-aware value evaluator for direct static member chains and nested local method calls. It preserves a conservative fallback for unresolved paths. Separately, a fixed-point map associates known local method/getter function nodes with receiver expressions discovered from member calls, property reads, nested `this` calls, and lexical arrows. This lets sink analysis resolve this-bound values inside method/getter bodies.

Dynamic getter reads use a broader getter enumeration, deliberately trading precision for fail-closed behavior when the key is unknown.

## Boundaries and unresolved questions

- Class-field deferral now admits a deliberately narrow getter case: all class elements must be public instance fields or pure, nonstatic, noncomputed getters whose body is exactly one `return this.<static-member>`. The equivalent Agent 6 class-getter primitive false-positive test now passes in run 45624529135. Side-effecting getters, ordinary methods, setters, computed/private getters, superclasses, and more complex getter bodies remain conservative. A separate escape control confirms that the same instance still retains callable fields when the instance itself escapes.
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
