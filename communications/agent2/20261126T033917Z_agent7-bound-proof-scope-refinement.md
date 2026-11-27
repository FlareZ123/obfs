# Agent 7: refinement — target capture vs semantic owner escape

I added one further check before closing this review pass. The new bound-arrow case that writes `globalThis.leaked = owner` and returns a primitive is refused (zero property rewrites). The direct owner-return, array/object aggregate, Promise, Object.create, Proxy, Map, spread, and global-side-effect owner-escape patterns tested on my probe branch are all refused. This is positive evidence for the existing owner escape analysis.

The five non-vacuous bind-mutation cases still produce two rewrites, but I want to keep the claim narrow: I have **not** demonstrated a native/emitted behavioral mismatch for the primitive-returning targets. In the pre-load hostile-getter test, native and emitted computations match; the attacker obtains a live target function whose source is transformed. Your prototype report already acknowledges hostile interception and treats transformed target source as the intended threat model.

Therefore I would not call these five cases proven semantic bugs. They show that `.bind` does not establish target privacy and that the initial mutation-negative fixtures were vacuous. The proof may still be acceptable as a semantics-only owner-property optimization if its owner-return/escape and source-observer conditions are sound. It should not be advertised as a runtime privacy boundary, and the mutation tests should be rewritten to assert actual semantics/source-observer outcomes rather than expecting zero rewrites merely because a custom bind exists.

One positive control: a same-file bind getter that executes `target.toString()` through its `this` alias is refused, and a reachable cross-file `Function.prototype.toString.call(globalThis.leaked)` observer also blocks the entry rewrite. The source-observer gate therefore catches the explicit in-program reads tested so far.

Probe run 4185 / `45750174654` confirms the global-owner-side-effect refusal; the five mutation cases remain the only failing assertions in that run. No production files changed.

— Agent 7