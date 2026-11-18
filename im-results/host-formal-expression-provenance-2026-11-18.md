# Expression and opaque producer origins for destructured named formals

**Date:** 2026-11-18. **Classification:** intermediate Node ESM semantic safety, not an obfuscation security improvement.

## Failing closed-record premise

A source-visible local function may destructure a named `{Reflect: cap}` formal and mutate `cap.ownKeys`. The original proof transfers known ambient provenance when the actual is an **Identifier**, e.g. `rewire(globalThis)`; it silently skipped non-Identifier actuals. The actual can still be the ambient root through `(0,globalThis)`, `[globalThis][0]`, `({root:globalThis}).root` or `root()` returning `globalThis`. A fifth container-alias case was already conservatively refused.

At exact **test-only** current-main source `9925e2ab0a36e926741357c9ac407f50efbd8676`, [two-platform red 44206420262](https://github.com/FlareZ123/obfs/actions/runs/44206420262) failed **4 of 42** actual original/generated ESM comparisons on both Ubuntu and Windows. The mismatch remained native `['secretField']` versus emitted `['_p...']`. The other 38 tests passed.

An additional named-formal default initializer obtains ambient `globalThis.Reflect` from a missing field, while a benign local literal record should preserve a real private owner rename. Adding both controls to source `cf37f94c386cfba48e27292eec9f187ac611592a` gave [two-platform red 44206708696](https://github.com/FlareZ123/obfs/actions/runs/44206708696): **4/44** fail, with default and benign controls both passing. This isolates the missing non-Identifier actual evidence rather than all pattern defaults.

## Bounded candidate repair

`src/cross-properties.js::safeClosedCallerRecordRead` now treats each non-Identifier actual entering a statically known ObjectPattern formal as unresolved unless it is an **explicit local object literal** with static own keys and inert recursive values, with every destructured key actually present as an own field. It refuses accessors, spreads, duplicate/magic `__proto__` keys, unproved calls and computed dynamic values. This permits local records with nested immutable data such as `{Reflect:{ownKeys:null}}`, which cannot be an ambient Reflect object through a getter or host alias.

Function.prototype.bind can capture only an initial prefix of formal parameters and leave the ObjectPattern tail for a later invocation. The proof therefore skips *missing tail* formals on a recognized `.bind` construction and follows the remaining formals on the later bound call using the preexisting localCallFormals slice/alias fixed point. Without this caveat, an initial conservative patch at `f06a4dc` [red 44207099901](https://github.com/FlareZ123/obfs/actions/runs/44207099901) failed two prior positive cases (local inert nested record and partially-bound benign function) on each OS despite fixing the four new negatives. The next candidate `8649e0a998b5ca42617761b96b0a1fe9852a220f` restores those positives.

## Required release check

Targeted `node --test test/closed-record-host-formal-provenance.test.js` must prove all 44 Node ESM comparisons, explicit cross-file positive one-key rewrite controls, strict source-observer checks, and both Node22 OS. The whole `manual-transform-safety.yml` workflow includes the target file plus other property-proof tests and sampled compute profiles. The full `manual-validation.yml` Node22 Windows/Ubuntu and Ubuntu real Chromium gate must pass at a **current-main-reconciled exact source SHA**, independent from the targeted gate.

**Status:** candidate `8649e0a` targeted validation pending. If broad tests reject a wider conservative refusal, preserve the failing proof and keep the branch unmerged. No claim is made that all dynamic JavaScript effects are modeled, or that static and dynamic hostile-runtime attackers face a greater cost. The changed logic is compiler-time provenance only and does not insert new runtime computations.
