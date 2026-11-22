# Source-ordered post-owner immutable keys in top-level destructuring

22 November 2026. **Intermediate static owner-usage proof with differential parity evidence**, deliberately narrower than unrestricted JS dataflow. This result does not establish a security or arbitrary-code 2.5× performance advantage.

## Proven case and boundary

Earlier versions of the local property proof admitted `const key="secretField";const owner={secretField:41};const {[key]:value}=owner` because `key` was initialized before the owner. The source is just as determinate for an **immediately evaluated top-level pattern** where the owner is created first, a uniquely declared immutable key receives a pure static string initializer, then a top-level `const {[key]:value}=owner` or `({[key]:value}=owner)` executes. The key's evaluation has no side effects and its initializer is complete by the point the pattern executes.

The opt-in private-owner proof now records top-level pure `const` bindings and initializer end offsets, checking a computed `Identifier` pattern key's source offset against that completed initializer. Only direct `Program`-level variable binding patterns, exported variable binding patterns and discarded direct assignment patterns use this extra rule. The existing property-owning, alias-use, reflection, source-observation and unique-binding checks remain prerequisites. The compiler emits a static rewritten key `["_p..."]` and consistently renames the owner's matching own field. It does not change the public immutable `key` binding.

A pattern nested inside a callable may be invoked **before** a later `const` initialization, even when its syntax appears later; the extra proof explicitly refuses such nested patterns. A direct earlier access to a later key in a lexical TDZ also remains unproved. Computed function calls, mutable `let` bindings, uncontrolled imported keys and unproved object shape escape are outside this lane.

## Source-pinned tests

- [Negative control 45046818790](https://github.com/FlareZ123/obfs/actions/runs/45046818790), source `e8f2d15eced002995be57186e558d756f35e4469`: on both Ubuntu and Windows, two proposed top-level post-owner positives failed the previously conservative zero-renaming result, while safety and parity negative cases passed.
- [Initial compiler implementation 45046876639](https://github.com/FlareZ123/obfs/actions/runs/45046876639), source `3f5b95436252587554c9513b49c88dcd242ef98f`: all runtime tests passed, but strict JSDoc caught an optional AST parent lookup type mismatch, TS2345. That mismatch was fixed before accepting the patch.
- [Fixed compiler 45046920500](https://github.com/FlareZ123/obfs/actions/runs/45046920500), source `3658aa65d1c6d365aa4496992b7358e652caf2a9`: focused tests and strict project/external JSDoc checks passed on both platforms.
- [Expanded 18-case focused regression 45047047498](https://github.com/FlareZ123/obfs/actions/runs/45047047498), source `294098a2239b35b9abddbb9543d59d72cf36ead1`: **18/18 tests passed on Ubuntu and 18/18 on Windows**, along with the strict JSDoc gates. The added cases cover a direct post-owner binding, discarded assignment, exported computed binding, nested late-key refusal, nested early-call TDZ and direct pre-initialization TDZ. Every fixture compares the native and obfuscated Node ESM process exit status, stdout and stderr.
- A full-source mainline validation of this exact revision was dispatched as [45047070768](https://github.com/FlareZ123/obfs/actions/runs/45047070768); check its final result before making a full-integration claim.

## Interpretation

This is an additional closed-world compile-time property-name proof, with no new per-execution helper, VM layer or runtime string decoder. The public exported object's own fields may change as intended by the closed-world opt-in contract, so any unproved owner exposure still blocks the rewrite. The change is practical semantic coverage for a source-ordered subset of JavaScript. It does not solve runtime extraction, external host trust, complete interprocedural analysis or the primary security-performance release block.
