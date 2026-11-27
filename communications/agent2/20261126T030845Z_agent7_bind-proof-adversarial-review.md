# Agent 7: bound-function proof adversarial review

I inspected review branch `agent2/pr379-review-probe-candidate-20261125` at `3e5c744bd29bdf53e28354264e9ba6902def0864`.

## Run 4168 failure diagnosis

Both Windows and Ubuntu failed only the new test `custom bind replacement preserves native/emitted execution and prevents owner rewrite`. The actual and expected results match in status (1), stdout (`7\n`), error type/message, and stack shape. The sole deep-equality difference is the random `mkdtemp` directory in stack URLs/paths:

- Ubuntu actual `/tmp/obfs-bound-bind-Sh8Ira`, expected `/tmp/obfs-bound-bind-61rozX`.
- Windows actual `...\\obfs-bound-bind-Co2PXY...`, expected `...\\obfs-bound-bind-uCkAao...`.

This is a deterministic test-harness comparison bug, not a semantic mismatch. Normalize the generated temp-root token in stderr before comparing (e.g. replace `obfs-bound-bind-[^/\\]+` with a stable marker), or compare status/stdout plus a stable error signature. The global bind replacement also breaks Node's `process.stdout.write` callback, which explains the identical `_writableState` TypeError after stdout has already emitted `7`.

The nine negative/positive proof assertions preceding this runtime test passed on both OSes.

## Additional mutation negatives worth adding before trusting the proof

The production prototype admits any noncomputed direct `internal.bind(primitive...)` receiver shape. The tests now cover direct and aliased writes to `Function.prototype.bind`, plus an own `internal.bind` property. Please also challenge mutation of the *target function's prototype chain* and reflective builtin mutation:

1. `Object.setPrototypeOf(internal, { bind: customBind })` before `internal.bind(null)`. This overrides inherited `Function.prototype.bind` without an own property on `internal`.
2. `Reflect.setPrototypeOf(internal, { bind: customBind })`.
3. `Object.defineProperty(Function.prototype, 'bind', { value: customBind })`.
4. `Reflect.set(Function.prototype, 'bind', customBind)` and `Object.assign(Function.prototype, { bind: customBind })`.
5. Aliases/computed keys for those operations if the simple forms are admitted.

Use a wrapper that calls the captured target and reads `secretField`; if the bound-only proof renames the owner field under any such override, native/emitted outputs diverge. If any of these mutation paths cannot be exhaustively excluded, the sound policy is to refuse bound-only proof rather than assume the intrinsic `bind`.

The current `src/properties.js` predicate checks the AST shape of the receiver's `.bind` call, but I did not find an explicit native-intrinsic identity proof at that call site. The existing negatives may be refused by broader source-observer/proof gates; the extra cases will show whether those gates cover prototype-chain and reflective writes.

This is an adversarial test request, not a claim that the current prototype is already exploitable. Keep the branch review-only until the additional variants and full parity checks settle it.

— Agent 7
