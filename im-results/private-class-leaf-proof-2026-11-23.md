# Bounded private class-leaf own-key proof, 23 November 2026

**Status:** isolated engineering candidate, not a release/security result. **Author:** Agent 15.
**Branch:** [`agent15/private-class-leaf-20261123`](https://github.com/FlareZ123/obfs/tree/agent15/private-class-leaf-20261123).
**Tested source:** `469106305af34d00909140454b7cc718427393c7` for the expanded 15-case suite. The exact source and parent are visible in the linked CI run.

## Motivation and proof boundary

Postmerge PR #322 correctly protects externally observable callable bodies from own-field spelling changes. This causes a loss of positive key-rewrite coverage even when a local class method is fully private. The earlier `test/private-class-source-yield.test.js` expected its own field to remain transformable.

The pilot in `src/properties.js` adds a narrow, AST-proven class leaf to the existing `privateFunctionNodes` set:

- A uniquely named, locally declared class without `extends` and with exactly one instance method; the method is noncomputed, nonstatic, synchronous, nongenerator, zero-parameter, and a single return of a statically keyed lexical owner read.
- Exactly one `const` instance construction via `new ClassName()` in the same lexical scope. Other class-name uses are declined, so the class constructor and prototype do not escape.
- The instance is used exclusively as the receiver in direct, zero-argument `instance.method()` calls. Other uses, method extraction, method source inspection, aliases, reflection, added methods, getters, constructed arguments, computed dispatch and multiple instances are declined.
- The existing root-owner proof separately verifies the object-literal own fields and their other uses. The existing whole-file and cross-file source observation vetoes remain in place. This helper **does not** admit arbitrary class fields or unsafe exported class methods.

The class binding is absent from `collectBindingScopes`, so the helper derives its nearest lexical scope from its own AST walk ancestry. The instance's existing `const` lexical scope must exactly match.

This argument is intentionally limited to the stated syntax and normal JavaScript behavior. Hostile runtime instrumentation, inspecting emitted module bytes, debugger APIs, legacy source side channels beyond the admitted grammar, and arbitrary unproved code remain outside any confidentiality guarantee.

## Reproducible controls

- Original focused 14-case branch verification at source `28424dc2d49a3def48a0493d2113b771573b7e58`: [45116033875](https://github.com/FlareZ123/obfs/actions/runs/45116033875) **passed Ubuntu and Windows**, including 3 modes and 11 independent refusal examples, project and external JSDoc checks.
- Existing two-mode private-class regression at the same source: [45116124797](https://github.com/FlareZ123/obfs/actions/runs/45116124797) **passed Ubuntu and Windows**.
- Expanded 15-case suite with source-only static-key neutralizer and real three-module ESM execution at `469106305af34d00909140454b7cc718427393c7`: [45116567663](https://github.com/FlareZ123/obfs/actions/runs/45116567663) **passed Ubuntu and Windows**, including strict project/external JSDoc. Native and emitted outputs matched in each admitted case. The positive emitted fields numbered exactly two for each compiler mode; a public-only AST attacker recovered both opaque labels and replayed equivalent outputs.

An initial ESM graph test intentionally encountered a separate global source-observer restriction: importing an unknown runtime value into arithmetic and possible function-to-string coercion conservatively vetoed every graph-wide rewrite. An identical single isolated leaf produced two transformed fields. The final cross-file test instead uses a primitive result re-export and strict numeric equality, avoiding unproved imported-value coercion. This narrows the graph claim and preserves the existing safety veto. The diagnostic branches were **red**, not ignored and not security wins.

## Interpretation and open gates

This is verified *for the finite fixtures only* as an improvement in useful property-renaming coverage while preserving known source-observation refusals. The source-only normalizer's successful key recovery is negative security evidence. No general anti-deobfuscation, environment-lock, runtime integrity, or performance claim follows. The proof emits no extra runtime interpreter, but a genuine 2.5× whole-application benchmark and an exact-head full two-OS/Chromium integration are still required before merging or calling this an integrated candidate. Current strong-protection decision remains **RELEASE-BLOCKED**.

Recommended peer review: challenge the class/instance escape proof with nested lexical scopes, getters/reentrancy, inherited prototype effects, and native source observations before integrating. Coordinate with Agent 10's PR #322 full-suite triage and Agent 3's source-preservation architecture; maintain conservative refusal if a premise is not demonstrable.
