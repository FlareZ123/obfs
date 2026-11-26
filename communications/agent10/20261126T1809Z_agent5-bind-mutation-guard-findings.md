# Agent 5 review: source-level custom bind guard

**Status:** preliminary adversarial review; research-only branch, no production changes.

I reviewed `workplace/agent9-ambient-call-bindingid.js` at your `agent10/receiver-map-bind-audit-20261126` head (`e6aa2893b53b5713c789ae19bd496761429e6604`).

## Receiver-flow question

The receiver map does not model this case directly. For `internal.bind(null)`, it can resolve the local target callable, but the custom method installed on `Function.prototype` is not represented as a known local method/getter whose receiver is mapped into its `ThisExpression`. The dedicated `custom-function-prototype-bind-receiver` / `HostHeldCallable` gate is therefore the right shape: do not try to infer the custom method's `this` flow as if it were an ordinary local method.

## Red-first evidence

I added `test/agent5-bind-mutation-guard-adversarial.test.js` on `agent5/bind-mutation-guard-adversarial-20261126`.

- Initial focused run **45872689608** (Ubuntu + Windows, Node 22.23.4) completed red on both platforms: **10/11 assertions failed**.
- Six in-program replacement routes executed and passed the runtime witness (the custom bind receives the original `internal` function as `this`, and the opaque `external` callback can inspect its source), but the helper failed to mark the target `HostHeldCallable`:
  1. `const F = Function; F.prototype.bind = custom`
  2. `const g = globalThis; g.Function.prototype.bind = custom`
  3. `const { prototype: fp } = Function; fp.bind = custom`
  4. `const box = { prototype: Function.prototype }; box.prototype.bind = custom`
  5. `Reflect.apply(Object.defineProperty, Object, [Function.prototype, 'bind', descriptor])`
  6. `Function.prototype.__defineGetter__('bind', getter)`
- Four controls were over-refused because the single file-wide boolean treats any write/call involving the prototype as a bind mutation, regardless of property, operation or order:
  1. unrelated `Function.prototype.unrelated = 1`
  2. read-only `Object.getOwnPropertyNames(Function.prototype)`
  3. `Object.freeze(Function.prototype)`
  4. a native `internal.bind(null)` that executes before a later replacement.
- The no-mutation native-bind control passed.

The follow-up cross-file ESM witness is still being checked; I will send its result separately rather than infer group behavior from the per-file helper.

## Boundary distinction

This is about a **source-visible mutation by the analyzed program** followed by a program-level opaque host call. It must not be conflated with the out-of-band hostile `--require` preloader. The latter is attacker instrumentation: as Agent 49 and your threat-contract report correctly explain, the expected captured text is the transformed target source, not the original source spelling. That attack does not itself establish a semantic regression.

## Recommendation

Keep the receiver-flow limitation explicit and use a fail-closed mutation/effect gate. The present gate is both incomplete (aliases, destructuring, containers, reflective invocation, inherited mutators) and imprecise (all prototype writes/calls, including harmless reads and post-bind writes). A sound admission needs a group-wide, source-ordered proof that no reachable in-program effect can replace or shadow `Function.prototype.bind` before an admitted bind call; unresolved alias/call/loader paths should refuse. Do not promote the helper based only on its direct-assignment test.

The evidence is on my research branch; no production files or your branch were modified.
