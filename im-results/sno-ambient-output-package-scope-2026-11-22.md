# SNO ambient output package-scope mismatch, build-time refusal

**22 November 2026. Classification: reproducible compatibility finding, not
a security result.** Validation is limited to a four-case focused test,
strict JSDoc and Node 22 on Ubuntu/Windows at the source pin below.

## Problem and source of truth

Node determines whether a `.js` file is CommonJS or ESM from its nearest
parent `package.json`. Its package search can reach *outside* the
obfuscator's emitted directory. An input group with an unscoped CommonJS
`entry.js` can therefore be classified as CommonJS in its original tree
but ESM after it is emitted under an unrelated `{"type":"module"}` parent.

Official Node 22 package-scope reference:
https://nodejs.org/download/release/latest-jod/docs/api/packages.html

A minimal independent Node 22.16.0 observation uses:

- Original: `source/entry.js` contains `module.exports=23;`; no
  parent `package.json`; `require(source/entry.js)` returns `23`.
- Output: `host/package.json` contains `{"type":"module"}`;
  `host/distribution/entry.js` contains the same source; the generated
  `sno-entry.cjs` performs `require('./entry.js')`.
- Starting `sno-entry.cjs` fails with `ReferenceError: module is not defined`
  because the `.js` file is now an ES module.

This is an input/output execution-environment mismatch, even when the
source bytes and integrity hashes agree. A build that merely rewrites
the entry hash cannot correct the Node package scope.

## Bounded change

The `src/cli.js` SNO publisher now checks its **actual output
destination before writing any generated file**. For every emitted
`.js` lacking a nearest emitted `package.json`, it checks the nearest
on-disk package scope around the canonical output path, respecting the
`node_modules` boundary. A surrounding `{"type":"module"}` produces
an explicit rejection.

The check preserves accepted cases when the emitted file is independently
scoped by a packaged `{"type":"commonjs"}`, and when the output uses only
`.cjs`. It does not create surprise `package.json` metadata, which
could be visible to an application's filesystem readers.

Focused cases in
[`test/sno-ambient-package-scope.test.js`](../test/sno-ambient-package-scope.test.js):

1. Unscoped CommonJS `.js` beneath ambient ESM: refuse before publication;
   original module returns `23`.
2. Root packaged CommonJS `.js` beneath ambient ESM: accept; SNO result `29`.
3. Nested packaged CommonJS `.js` with no root package: accept; result `31`.
4. `.cjs`-only output beneath ambient ESM: accept; result `37`.

## Validation receipt

The focused two-OS
[GitHub Actions run 45022626170](https://github.com/FlareZ123/obfs/actions/runs/45022626170)
on exact executable source commit
`a93a8c6e9ba2d79420dbb1f848c6c2d1c7a716df`
passed both Ubuntu and Windows Node 22.23.4 jobs. Each job completed the
focused four-case test, project JSDoc and external JSDoc checks. The
full repository suite and browser tests were **not** dispatched for
this candidate. Later documentation commits do not change the executable
source involved in that receipt.

A separate minimal local Node 22.16.0 experiment reproduced the
underlying ESM-parent execution failure without the compiler. The
two-platform focused run verifies the actual compiler admission behavior.

## Limits and release implication

The programmatic `createSnoLauncher(files,entry)` cannot perform the
directory preflight: it receives no intended deployment path. Integrators
using this API must review the actual module scope themselves.

The check is local to build time. Copying the output to a new package tree,
changing parent `package.json` later, or an attacker replacing files or
intercepting the Node loader invalidates the assumption. Stale, untracked
package metadata in reused output directories remains an operational risk;
build into a clean directory and verify the destination's package tree.

No original runtime hot path is changed and no incremental runtime cost
has been measured. This finding establishes neither source secrecy,
tamper resistance under the specified SNO filesystem owner, nor universal
2.5× compute compliance. The project's **RELEASE-BLOCKED** decision is
unchanged.
