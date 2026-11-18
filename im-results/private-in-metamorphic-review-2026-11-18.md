# Independent private `in`-operator metamorphic review

**Agent 2, 18 November 2026. Intermediate compatibility evidence only.**

## Claim and source pin

The previously independently reviewed own-key `in` rewrite merged through [PR #106](https://github.com/FlareZ123/obfs/pull/106). This additional review tests whether the owner/key renamer consistently handles unusual string keys, ordinary control-flow and conservative refusal contexts. It does not claim a secrecy improvement or universal equivalence.

The review branch `agent2-private-in-20261118-review` branched from main `cf1f8e0574b2bc947f18271ee253fca9e1e21fb4`. Its source with the new test and typechecker/workflow registration was `3ce0539871350baa845896edb11a5e2ec6ed3726`, independently executed in the [Ubuntu/Windows focused run 44292442697](https://github.com/FlareZ123/obfs/actions/runs/44292442697), **success** on both platforms.

Both OS jobs passed their targeted private-own-key, adversarial, Symbol-key and source-only reconstruction checks, hot-loop/cold profiles, and strict internal/external JSDoc. Ubuntu passed real Chromium Symbol and `in` integrations; the intentionally OS-conditional browser steps were skipped on Windows.

## New reproducible corpus

Run `node --test test/property-in-metamorphic.test.js` from the repository root with declared dependencies installed.

The new file includes 54 native-versus-obfuscated CommonJS source programs, each evaluated for both COO and SNO:

- 32 separate string-key programs with unusual property names (non-ASCII BMP, astral code points, lone surrogate escapes, NUL, quote, backslash, newline, tab, numeric-looking keys and other spellings). Each includes an alias membership, computed literal read, separate owner and second membership; both independent objects are required to be *actually* renamed (two renamed fields).
- Nine ordinary positive ownership contexts including conditionals, negation, loops, closure membership, numeric update, alias and interprocedural call. Each must rename one owner field.
- Thirteen unproved mutation/escape contexts including reflective deletion, clone/spread, Proxy, nonown/inherited membership, unknown key, prototype inheritance and Symbol query. Each must retain the field name (zero renamed fields).

Each program's output is compared exactly under a fresh Node VM CommonJS context; emitted transformations must also meet the expected property-count admission. This distinguishes a vacuous total-refusal compiler from the desired bounded rewrite. The case count is 54 source programs, 108 generated comparisons per operating-system run; it is a finite differential corpus, not a universal proof.

## Independent semantic review and bounds

At the current implementation, the `in` admission accepts a direct literal string left operand and a proven owner/right identifier, reusing the existing closed-world alias/escape proof and requiring every query to denote an initial own key. It rewrites the literal only after the complete owner candidate is accepted and hashed. `in` preserves its original operand evaluation order and boolean result on these admitted cases.

This review did not identify an active output mismatch in the tested cases. The tests do not address external runtime instrumentation, hostile host intrinsics, undetected dynamic source observation, unknown JavaScript feature interactions, or a general 2.5× runtime guarantee. The separately published source-only reconstruction counterexample remains effective: the protected names are present in the public output and can be normalized offline. The overall `RELEASE-BLOCKED` decision for strong protection is unchanged.

## Additional integration condition

A complete Ubuntu/Windows + Chromium integration run should be cited at its *exact* review-branch source SHA before merging, to detect unrelated concurrent changes. The focused result alone supports only the listed test and OS boundaries.
