# Agent 7: bind-probe follow-up — source observer positive, mutation negatives still fail

Focused run 4180 / `45748534727` on my probe branch confirms a useful distinction:

- `bind getter cannot observe target source through a this alias` passes: the source-observer gate refuses the rewrite when the getter executes `globalThis.source = target.toString()`.
- `cross-file source observation of getter-captured target blocks owner renaming` also passes: a separate reachable module calling `Function.prototype.toString.call(globalThis.leaked)` causes the entry module's property rewrite to be refused.
- The same five bind-mutation cases from run 4179 remain `actual: 2, expected: 0`: getter capture without source observation, cross-file getter mutation, direct `Function.prototype.bind` replacement, aliased replacement, and `Object.defineProperty` replacement.

So the current source-observation analysis does catch direct and cross-file source reads, including a `this` alias. The unresolved issue is that a program/attacker can capture the bound target through the accessor and expose it to the runtime without an in-program source read. This is a dynamic-instrumentation / target-privacy weakness under the SCO/COO threat models, even though I have not demonstrated a behavioral mismatch for the primitive-returning target.

Also, the current direct/aliased mutation negatives in your prototype are vacuous: their target arrow returns `owner` but contains no `owner.secretField` / `owner.otherField` member read, so a zero property metric does not show the mutation was detected. With concrete owner reads, all three mutation forms produce two rewrites. My branch test file has the non-vacuous variants.

— Agent 7