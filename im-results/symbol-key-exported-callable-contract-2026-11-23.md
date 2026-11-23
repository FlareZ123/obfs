# Symbol-key demonstration and exported-callable source contract

**Agent 7, 23 November 2026. Intermediate compatibility and test-maintenance
evidence, not a new obfuscation strength claim.**

## Why the existing positives were incompatible with their source contract

The experimental `src/symbol-properties.js` pass delegates ownership to
`proveLocalObject`. The current `src/properties.js` intentionally declines
renaming a local record when one of its field references appears in a callable
whose original source remains externally observable. For example, exporting
`function calc(x){return bag.pulse+x}` permits a consumer to inspect
`calc.toString()`. Replacing `bag.pulse` with a Symbol access changes that
observable string. Under 1:1 behavior preservation the refusal is appropriate.

The original `test/symbol-keys.test.js` and
`examples/symbol-keys/before.cjs` exported precisely such a mutable
`calc` callable while requiring two fields to be rewritten. A two-module ESM
test likewise exported `touch` containing direct references to the private
record. These stale expected transformation counts were mistaken for semantic
regressions.

**Source-pinned baseline:** main `ce55ef65ae6cdd4889d4db20c3c7893055b52338`,
[focused workflow 45276165861](https://github.com/FlareZ123/obfs/actions/runs/45276165861).
Both Node 22.23.4 Ubuntu and Windows reported the same three failing names,
all expected nonzero transformed-object/field counts but got zero. Four other
test cases passed. The observed failures alone do not prove source text parity;
the underlying proof guard and explicit negative controls provide that
separate reasoning.

## Corrected positive and explicit negative controls

In [PR #360](https://github.com/FlareZ123/obfs/pull/360), the original
mutable `calc` and ESM `touch` remain locally invoked while only computed
numeric values are exported. These fixtures continue to require two actual
Symbol-generated fields and exact native-vs-emitted results. The deterministic
checked-in `before.cjs` and `after.cjs` demonstrate the executable output;
the sample builder still verifies byte-for-byte reproducibility.

Two new negative controls directly export CJS/ESM functions that access a local
record and require **zero** Symbol rewrites. The CJS control additionally
executes the module and checks the actual callable's `toString()` spelling.
This separates source-observable API safety from positive local field mutation.

**Validated source:** `1920c7ccbdb1613bc04662c38495c2b7ba879d3d`,
[focused branch workflow 45276803068](https://github.com/FlareZ123/obfs/actions/runs/45276803068).
Both Ubuntu and Windows passed the complete focused Symbol suite and project,
external and paired-budget JSDoc gates. PR #360 merged as
`f70f60b65c82f9b1f821287f94d7315d6db67c3f`.

A later [mainline focused run 45277103982](https://github.com/FlareZ123/obfs/actions/runs/45277103982)
at `da8c2033ce0c12d4fc582ab7cdb34388bf5a3e1f` passed the same selected
test and strict JSDoc steps on both platforms after integration with intervening
commits. Its unfocused `node22` job was deliberately skipped.

## Scope

This change alters tests and example source/output files only. It does not
expand the proof, implement a new obfuscation technique, imply whole-program
parity, measure the 2.5× runtime ceiling, or change the project's
**RELEASE-BLOCKED** status. Remaining full-suite failures must be judged
against their own semantics; do not mechanically convert other positive-yield
failures into refusals without demonstrating a real source-observation
boundary and retaining a distinct valid positive.
