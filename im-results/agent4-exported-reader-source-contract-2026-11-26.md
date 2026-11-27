> **Policy correction (2026-11-26T07:43Z): external source inspection is attacker observation, not a source-preservation contract.**
>
> Agent 3's bind-policy review correctly distinguishes in-program source observation from hostile host/DevTools/preloader observation. If the obfuscated program itself calls `Function.prototype.toString` and depends on the returned text, preserving that behavior or refusing the transformation is a semantic requirement. An external attacker calling the built-in on a captured function is part of the threat model; the attacker should see transformed source containing obfuscated property names, not force the compiler to preserve original spellings.
>
> Accordingly, the analysis below is **not** a justification for refusing property renames solely because an exported function's source can be inspected externally. The remaining question is semantic: can external callers supply arbitrary objects to an exported reader, or is the owner a private object closed over by a wrapper? An exported generic `read(owner)` must preserve its original property contract; a zero-argument exported wrapper over a private owner may be safely transformable if no in-program source observer depends on its original source. The factory/private-reader experiment's unchanged wrapper source was incidental, not a required security property.
>
> The original discussion remains useful as a description of the current implementation's conservative boundary and yield gap, but its external-source-parity framing is superseded.

# Exported-reader visibility versus property-renaming yield

**Date:** 2026-11-26  
**Status:** Intermediate design analysis; policy corrected below; not an established result or release decision.  
**Author:** Agent 4

## Question

Should the remaining `factory-object-flow` and `interfile` positive-yield failures be solved by broadening the new bounded private-reader proof, or do their fixtures conflict with the repository's source-stability contract?

## Exact failing shapes

The integrated full run 4262 / [45772098857](https://github.com/FlareZ123/obfs/actions/runs/45772098857), source `88c66048c01dde3ba54fbf1b2da14f65d490c087`, still fails these two cases on Ubuntu and Windows:

1. `test/factory-object-flow.test.js` — `state.mjs` privately constructs an object through `make()`, then exports `read()` whose own body directly reads `owner.secretField` and `owner.otherField`.
2. `test/interfile.test.js` — `state.mjs` exports `state` and `internal()`; `internal()` directly reads `state.secretValue`. Other files import `state` and read its properties.

Both tests expect positive property renaming. The full run has nine failures total; these two are unchanged from exact current-main baseline run 4253 / [45768179948](https://github.com/FlareZ123/obfs/actions/runs/45768179948).

## Why the new private-reader proof is different

The bounded proof in `src/properties.js` admits only an exact edge from a potentially source-observable caller to a *private* direct-call-only reader:

- The exported caller passes the tracked owner as the reader's sole argument.
- The reader is local, direct-call-only, nonescaping, non-async/non-generator, non-forwarding, and has one identifier parameter.
- Its entire body is one static member return, an arrow expression static member return, or a unique `const value = owner.staticKey; return value;` sequence.
- The member read is noncomputed and nonoptional; all owner aliases/calls remain tracked.

This transforms the private reader's body while leaving the exported wrapper's source unchanged. The positive native-ESM test covers that distinction. Focused run 4266 / [45772753925](https://github.com/FlareZ123/obfs/actions/runs/45772753925) passed the expanded reader-proof suite on Ubuntu, Windows, and macOS; the full Node22 job was skipped in that focused run.

The two remaining fixtures have no such private-reader edge: the member expressions are directly inside the exported functions themselves. Applying a property-key rename necessarily edits those function bodies.

## Observable-source constraint

For a function whose body contains a static property access, the built-in `Function.prototype.toString` exposes the function's source text. If the obfuscator changes `owner.secretField` to `owner._p...` inside that function, the source string necessarily changes.

I reproduced this with Node.js v22.16.0: two otherwise equivalent function definitions with different member spellings produce different results from `Function.prototype.toString.call(fn)`. Assigning a custom `fn.toString` method does not help; the built-in `Function.prototype.toString.call(fn)` still returns the changed source.

Therefore, if the compatibility contract requires an exported function's source to remain byte-identical when a host obtains the function, there is no direct AST property rename that both hides the original member spelling and preserves that source. This is a constraint of the observable representation, not a missing alias-analysis edge.

There is a separate policy question: whether `closedWorld:true` permits changing the source of internal module exports when no in-program source observer exists. The attacker can inspect the transformed source, but it will show the obfuscated key rather than the original. Whether that host-side introspection must preserve native source is a contract decision, not something static ownership analysis can decide.

## Options

### A. Keep exported-source stability as a hard compatibility rule

- Keep the two direct exported readers unrenamed.
- Reclassify or rewrite the positive-yield expectations so they do not demand a transformation that violates the rule.
- Add a positive factory fixture where the exported wrapper delegates to private readers:
  `export function read(){return readSecret(owner)+readOther(owner);}`
  with `readSecret` and `readOther` private, direct-call-only readers. This combines single-use factory ownership with the bounded private-reader proof while preserving the exported wrapper's source.
- Add an assertion that the positive exported wrapper's `Function.prototype.toString.call(calculate)` is byte-identical before and after transformation. This tests the safety rationale directly.

### B. Permit source changes for closed-world internal exports

- Explicitly state that `closedWorld:true` allows transformation of exported functions not used as source observers by the supplied program.
- Retain fail-closed behavior for functions whose source is observed by program code, source-stable public APIs, or unknown external consumers.
- Add tests that distinguish host-side inspection of transformed code from an in-program requirement to preserve original `Function#toString` output.
- Audit exported object/module surfaces so renaming does not silently change APIs consumed outside the declared closed world.

### Not recommended

Do not broaden `privateConsumerArgument` to accept an exported function as the reader merely to reduce the failure count. That would collapse the distinction the proof was introduced to preserve and could silently change the source of an externally observable function.

## Evidence and current pins

- Full candidate 4262 / [45772098857](https://github.com/FlareZ123/obfs/actions/runs/45772098857), head `88c66048c01dde3ba54fbf1b2da14f65d490c087`: Ubuntu 5,454 tests (5,420 pass / 9 fail / 25 skip); Windows 5,454 (5,410 pass / 9 fail / 35 skip). The nine failure names are identical across OSes and are a strict subset of baseline 45768179948; the two reader-proof failures disappeared and no new failure appeared.
- Focused private-reader run 4266 / [45772753925](https://github.com/FlareZ123/obfs/actions/runs/45772753925), current test-only head `bafc473b1f5c1eb9776450d64a17c30fa3f4cb39`: passed on Ubuntu, Windows, and macOS with strict JSDoc; Node22 full job skipped.
- Focused SCO publication run 4264 / [45772487150](https://github.com/FlareZ123/obfs/actions/runs/45772487150), source/test head `88c660...`: passed on Ubuntu, Windows, and macOS with strict JSDoc; Node22 full job skipped.
- Current PR #379 remains draft; main does not contain the candidate production changes. At last inspection PR head was `bafc473...`, main was `ba0c620...`, and mergeability was false after main advanced.

This analysis is intermediate. It does not establish a new obfuscation-resistance result, prove the current release gate, or resolve the source-stability policy.
