# Full validation triage: reproducibility and property coverage regressions

Intermediate investigation by Agent 24, 2026-11-15 UTC. This document
records observed failed assertions without attributing an unproved root
cause or declaring a particular compiler transformation unsound.

## Exact reproduction

Manual full validation
[run 43753096374](https://github.com/FlareZ123/obfs/actions/runs/43753096374),
source `d394fa22396f85c7a9ff1bb5d74b4f092412fecf`,
Node 22 Ubuntu and Windows. `manual-validation.yml` now runs the built-in
`spec` reporter to display every failed assertion without truncating the
first tests. It ran 1,055 tests on both platforms:

| Platform | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Ubuntu | 1,049 | **5** | 1 |
| Windows | 1,048 | **6** | 1 |

Five shared failures:

1. `test/array-property-values.test.js` at line 29,
   “local literal array values can be renamed with all their owning keys”:
   compiler reported zero renamed keys, expected one. Actual runtime
   behavior was not shown to be unequal by this assertion.
2. Same file line 45, “closed-world ESM can rename exported literal-array
   keys and import reads”: zero renamed keys, expected two.
3. `test/branch-block-reconstruction.test.js` line 17,
   “checked-in branch sample matches the actual deterministic compiler”:
   current generated source differs from the checked-in
   `examples/branch-blocks/after/gate.cjs` golden despite equal block count.
   The independent attacker/reconstruction semantic tests in that file
   passed; regenerate and explain the golden drift, rather than weakening
   the exact reproducibility expectation.
4. `test/cross-file-hash-collision.test.js` line 45,
   “noncolliding cross-file properties remain transformable”: zero
   renamed keys, expected one.
5. `test/cross-file-identity-grid.test.js` line 49,
   “48 deterministic cross-file identity graphs preserve native ESM
   execution”: failure at index 3; zero renamed keys, expected two.
   Other cross-file identity cases in the suite completed.

One Windows-only failure:
`test/affine-native.test.js` line 164,
“affine native: committed before/after can be reproduced exactly”.
The checked-in `after.cjs` had a different seeded affine encoding when
compiled from Windows CRLF `before.cjs`, whereas Ubuntu passed. Agent 24
normalized line endings in both `examples/affine-native/build-sample.cjs`
and the corresponding exact-output test at source commit
`6bd0e9d446f797f3c8dc06a671e331b0413e46ac`. The repeat full [run 43753516849](https://github.com/FlareZ123/obfs/actions/runs/43753516849)
at commit `6bd0e9d446f797f3c8dc06a671e331b0413e46ac` confirms the
Windows-only affine failure is resolved. Both platforms now report
**1,049 passed, 5 failed, 1 skipped out of 1,055**; the remaining five
failures have the same names on both platforms.

The independent
[focused transformation suite 43752754825](https://github.com/FlareZ123/obfs/actions/runs/43752754825)
passed on Ubuntu and Windows. The new selective SCO and RPC authorization
focused suites also passed including strict JSDoc, demonstrating the full
validation failures are not reproduced by those narrower test selections.

## Interpretation and next actions

The four property-analysis failures are **coverage assertions**: the current
conservative transform declined formerly admissible literal/identity graphs.
Do not change their expected counts to zero merely to green CI. Inspect the
shared proof predicates in `src/properties.js` and `src/ast.js`, isolate
the precise conservative veto with a source-level test, and prove that
reopening the transformation cannot alter external API, reflection,
source-introspection or shared-reference semantics.

The branch golden mismatch is a deterministic artifact reproducibility
failure distinct from native execution equivalence. Keep existing
before/after artifact source but regenerate it with the current compiler
and document why its seed yields a different representation; preserve the
attacker reconstruction test.

Full validation remains a release blocker until all five remaining failures
are independently resolved. The separate experimental selective SCO result
should not be promoted as proof of a globally green obfuscator release.
