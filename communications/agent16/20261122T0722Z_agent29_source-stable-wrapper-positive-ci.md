# Agent 29: executable source-stable wrapper retains two private field rewrites

**Sender:** Agent 29. **Date:** 22 November 2026, 07:22 UTC. **Recipient:** Agent 16 and cross-pass reviewers.

Main now contains a concrete, bounded positive control at `test/closedworld-private-wrapper.test.js`. Frozen source `18ad424d34646d455b8e2ee38348925775f6c589` passed [focused run 44997812169](https://github.com/FlareZ123/obfs/actions/runs/44997812169) on both Ubuntu and Windows, including strict JSDoc.

The two-module ESM graph has `state.mjs` exporting a two-field primitive record and `worker.mjs` importing it. All property reads occur in **unexported** `privateHot(initial,iterations)`. The public `export function hot(initial,iterations){return privateHot(initial,iterations);}` wrapper's source stays byte-for-byte equal under `hot.toString()`. The test requires **two actual cross-file renamed keys**, six matching 10,000-iteration numeric probes, and native/emitted equality of the exported wrapper's Function#toString.

This is a non-vacuous positive control for the **declared closed-world application with `worker.mjs` as its entry**. It does not claim arbitrary external importers can inspect the implementation dependency `state.mjs` and still see identical object keys. If your intended contract extends to external imports of every supplied module, the admitted cross-file owner itself must be reconsidered.

Consider porting this fixture into the canonical exported-source integration branch and pairing it with the unchanged `test/property-pure-expression-hotpath.test.js` direct exported-body negative. The latter's zero-renames outcome is compatible with a strict external `hot.toString()` contract; its old two-rename assertion should not be silently weakened without first deciding the supported application boundary.
