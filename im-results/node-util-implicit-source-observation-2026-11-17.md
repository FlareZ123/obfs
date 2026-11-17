# Native Node util formatting as a hidden source observer

**Date:** 2026-11-17. **Classification:** intermediate semantic-compatibility
evidence. Strong anti-reconstruction gains are not claimed.

## Native Node observation

On Node 22.16.0, evaluating two source-equivalent VM scripts under the same
`util-source.cjs` name and context, with the only code difference being a
shortening of a preceding private property identifier, preserves the returned
property value 73. Nevertheless, serializing an `Error('probe')` through
`require('node:util').inspect` changed its visible location:

- original: `at util-source.cjs:1:110`
- shortened: `at util-source.cjs:1:82`

Separately, `util.inspect(function meaningfulOriginalFunction(){})` prints
`[Function: meaningfulOriginalFunction]`; the same function body with
a function name `x` prints `[Function: x]`. Neither observation requires
the source to contain a `.stack`, `.name`, or `.toString` access. These
are **manual native source-replacement observations**, not measurements of the
compiler's emitted transformation probability or static attacker cost.

## Conservative compiler guard and test

The `observesFunctionSource` logic in `src/ast.js` now recognizes direct
`require('node:util')` / `require('util')` and ESM `node:util` or `util`
imports. It follows local namespace aliases, destructured native methods,
and direct/bound method aliases. Source-admission declines when a
non-provably-primitive argument reaches `inspect` or `format`, or a
payload argument reaches `formatWithOptions`. A primitive direct call
`util.inspect(42)` remains eligible for a separate own-property rewrite.

The expanded nine-case `test/node-util-format-source-observation.test.js` checks
compiler source preservation, node-native Error frame extraction, printed
function names, CommonJS and ESM spelling variants, and the positive
primitive-inspection transform. The source-pinned manual workflow is
`.github/workflows/manual-implicit-console-source.yml`; its combined
console/util run [44097808187](https://github.com/FlareZ123/obfs/actions/runs/44097808187)
was **queued** on branch `agent50/node-util-console-observation-20261117`
at exact `70fbf4e73267f88381093f6a7cf44d747b7404cc` when first documented.

## Direct Node call-site API

Node 22.16.0's native `require('node:util').getCallSites(1)[0].columnNumber`
in a fixed-name VM program returned **145** before shortening an earlier
private-property identifier and **89** afterward. The program returned the
same protected value in each case. The AST proof now treats
`util.getCallSites()`, its historical `getCallSite` spelling, direct
native imports and simple aliases as source observers even with primitive
arguments. See [Node's v22 util documentation](https://nodejs.org/download/release/latest-jod/docs/api/util.html).
The corresponding actual-emitted SNO test includes a separate
unsafe-rewrite red control. Additional function-name and
`util.inspect(Error)` red controls are also in the suite.

## Boundaries and follow-up

This is a syntactic, conservative may-flow proof, not interprocedural native
host-equivalence proof. Computed dynamic util method names, imported wrapper
functions, arbitrary container aliases, custom inspectors, `util.callbackify`,
direct `Error` escapes and hostile replacement of Node built-ins remain
outside the tested guard. Declining entire files or graphs reduces actual
transformed content. The effect on representative positive protected-work
yield and the source attacker's reconstruction cost remain unmeasured.

Never label the candidate validated until its exact pinned workflow passed
the six Node regressions and strict JSDoc checks; running source text
unchanged establishes an admission safeguard only.
