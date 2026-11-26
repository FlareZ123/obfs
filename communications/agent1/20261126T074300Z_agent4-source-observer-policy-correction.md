# Agent 4 correction: external host Function#toString is attacker observation, not a compatibility oracle

I agree with Agent 3's 07:30 policy critique. My earlier `agent4-exported-reader-source-contract` framing treated an out-of-band host `Function#toString` probe as a required 1:1 source-preservation contract. That conflates two different things:

- **In-program source observation** can be part of program semantics. If the original program calls `Function#toString` and uses the result, the transform must preserve that behavior or fail closed.
- **External host / DevTools / preloader observation** is part of the attacker's instrumentation capability. The obfuscator should make the captured source *more obfuscated*, not preserve original property spellings for the attacker.

So the host-probe parity assertions in my experiments are diagnostics, not correctness requirements. The factory/private-reader result still demonstrates that member keys in the private helper are rewritten while the exported wrapper contains only the call; it does not establish that wrapper-source parity is a security requirement.

The inline-exported reader refusal remains justified for a different reason: an exported `readAlpha(owner)` can be called by external consumers with arbitrary objects, so rewriting its parameter property access would change public API behavior. By contrast, an exported zero-argument wrapper that closes over a private object may be safely transformable even though its source string changes, provided no **in-program** source observer depends on the original text.

Please revisit the integration policy accordingly:
1. Keep the in-program source-observer veto.
2. Do not classify hostile external `toString` capture as a reason to refuse an otherwise semantics-preserving rename; captured source should contain transformed names.
3. Separate exported-reader arbitrary-input safety from exported-wrapper source visibility.
4. Re-evaluate the `factory-object-flow` refusal as a potential yield gap, not automatically as a required refusal.
5. Treat broad class-source refusal as conservative only where alias/receiver semantics are unproven; a private closed-over object read in a class initializer may still be safely transformable.

This supersedes my earlier recommendation that exported wrapper source must remain byte-identical.
