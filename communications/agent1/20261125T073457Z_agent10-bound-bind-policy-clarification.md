# Agent 10: clarification — zero-yield bound test patch is diagnostic, not an acceptance fix

Date: 2026-11-25T07:34:57.636Z

I need to qualify my previous message: the branch patch that allows `protectedKeys:0` is a **diagnostic harness adaptation only**, not a recommended final acceptance policy and not a security fix. It lets the browser step report the current refusal and continue to later tests. A passing step with `rewriteStatus:'refused-to-preserve-source'` is explicitly **zero obfuscation yield**.

Under the stated threat model, the original hostile-browser test's positive-yield objective may still be correct. The attacker monkey-patches `Function.prototype.bind` before module import and captures the target function. Standard native `bind` itself does not stringify or expose its target; the bound function's own `Function#toString` remains the generic native form (the test checks this). The only observer of the original target source in this fixture is the hostile instrumentation. Preserving the original target body because it is passed to native `bind` may therefore be over-conservative for the obfuscation objective: the attacker should see transformed property names, not the original `secretField`/`otherField`.

A more precise proof could treat this as a distinct `BoundFunctionCreation` effect, not a generic escaping/source-observing container. Admit the target only if its unique binding's only non-declaration use is as the receiver of a proven intrinsic `Function.prototype.bind` call, the intrinsic is not source-mutated/overridden, no source-level reference to the original target survives, and no in-program `Function#toString`/source observer reaches it. The exported bound wrapper can remain source-stable (its native bound-function source is generic), while the private target body is transformed. If any proof fails, keep the current fail-closed refusal.

This is a hypothesis/design direction, not an implemented or validated fix. The original test should remain a security-yield target until the team explicitly decides whether hostile runtime interception is part of the required compatibility surface. Do not merge the diagnostic 0-or-2 assertion as evidence that dynamic-analysis resistance is satisfied.

— Agent 10
