# Annex-B simple-catch parameter and same-name var alias: Stage 1 admission witness (23 November 2026)

**Classification:** reproducible intermediate semantic-proof counterexample; **not** a production compiler security exploit. The read-only lexical resolver in `workplace/agent1-lexical-reference-resolver.js` is not consumed by `obfuscateFiles`.

## Native JavaScript semantics

A simple catch parameter and a same-name `var` declaration within that catch body are not two independently renameable spellings:

```js
function demonstration() {
  try { throw 'inner'; }
  catch (window) {
    var window = 'changed';
    return window;
  }
}
```

Node 22 evaluates the original to `'changed'`. A mechanically independent rename that chooses `catch (_caught) { var _hoisted = 'changed'; return _caught; }` evaluates to `'inner'`. In the companion case where `return window` occurs after the catch, the original returns `undefined`, but independently renaming the catch and hoisted var can return `'changed'`. This extends to a nested block, an object/array-destructured `var` declaration and `for (var ... of ...)`. An inner function with its own same-spelled var is different and should retain independent provenance.

The existing prototype gave distinct non-null declaration BindingIds to the catch parameter and the hoisted `var` declaration. Both ids were individually represented as usable while the read inside catch resolved to its catch parameter. Distinct identifiers alone are not a proof that renaming the declarations independently preserves the special source-spelled alias interaction.

## Evidence and patch

- Test-only red source: `7ad4306e2147661dfcd9089b2ce6d84eda7b5376`, `test/lexical-catch-var-binding-alias.test.js`.
- Independently executed **Ubuntu and Windows Node 22.23.4 red-first** [workflow 45243539813](https://github.com/FlareZ123/obfs/actions/runs/45243539813): native semantic counterexample and unrelated positive controls pass; binding-independence assertion fails on both platforms.
- Draft branch: `agent6/catch-var-binding-alias-20261123`; patch conservatively marks affected catch and containing var-scope bindings uncertain rather than issuing distinct non-null IDs. It checks the same var environment and keeps nested function declarations independent. The subsequent expanded branch includes destructured patterns and for-of loop heads.
- The expanded patch at `6141f90ee3f7d0ad247899fc1dfd01b0f3585e4e` passed the [focused two-OS regression and strict JSDoc workflow 45244135765](https://github.com/FlareZ123/obfs/actions/runs/45244135765). This checks the new negative and independent-name controls, not the whole repo or the separate Acorn/TypeScript matrix; those require their own source-pinned receipts.

## Additional independent Stage 1 checks

At exactly `833b0a64e2a8a5e5666df4e3a260f05886bcce0a`, the existing Stage 1 resolver fixture gate passed **9/9 tests** on both platforms in [45244417256](https://github.com/FlareZ123/obfs/actions/runs/45244417256), including its bounded 39 input fixtures; the separate Acorn/TypeScript semantic pairing gate passed **150 comparisons** on both platforms in [45244425109](https://github.com/FlareZ123/obfs/actions/runs/45244425109). Both runs include strict JSDoc steps. They do not test full application semantics because the resolver remains unused by the compiler.

## Boundaries and next verification

This is an admission-contract concern for the proposed lexical BindingId and rename passes. It does not show current production compiler output breaking on the example; no full-suite release conclusion follows. Before integrating the prototype, test the two-platform red/green regression and existing 39+ lexical and 150 independent Acorn/TypeScript classifications, then feed the binding uncertainty through future transformations conservatively. A richer alias-equivalence relation could preserve more rename opportunities but needs a separate semantic proof.


## Mainline adoption and independent strict-mode control, 19:10 UTC

Agent 1 reviewed the draft PR #342 patch against main, confirmed the 39-line addition with no code removal, and ported the read-only resolver correction and the original Agent 6 regression/report directly into main. The mainline source at `a059b65dcc258112e5d1e522f5b1b287ef0b7513` passed all three relevant focused workflows on Ubuntu and Windows, including the strict external JSDoc gate:

- [45245210662](https://github.com/FlareZ123/obfs/actions/runs/45245210662): 5/5 catch/var tests.
- [45245219146](https://github.com/FlareZ123/obfs/actions/runs/45245219146): 9/9 Stage 1 lexical resolver test groups.
- [45245226516](https://github.com/FlareZ123/obfs/actions/runs/45245226516): 150 independent TypeScript binding comparisons.

A later addendum added explicit execution under `"use strict"` for every native catch/var renaming counterexample in the five-group suite, rather than relying only on sloppy function execution. The resulting main source `0a163e140d15f42e671de77ab2b6d6b27425f459` passed focused [run 45245734904](https://github.com/FlareZ123/obfs/actions/runs/45245734904) on Ubuntu and Windows, including all existing strict JSDoc gates. The full Node suite was skipped by the focused workflow configuration.

These tests verify a conservative **read-only binding admission** correction under both sloppy and strict grammar. Neither the current production obfuscator nor its observed-function-source detection was modified; this evidence does not make the overall obfuscator release-ready.
