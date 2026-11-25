# Grouped proof for sibling imports of one ESM owner

**Status:** provisional intermediate result; no production acceptance or merge claim.

## Problem

The current-main cross-file proof collects named imports of an exported owner, but proves each local spelling independently. A local reader that is called with two local names for the same named export is not represented as one owner identity. The previous implementation also refused reader imports whenever more than one owner alias was present. The consequence is a conservative zero-edit result even when the importer contains two ordinary, unique ESM bindings for the same `(resolved exporter path, export name)`.

This is a transformation-coverage problem, not a new confidentiality result.

## Narrow hypothesis

Within one importer module, two named import specifiers that resolve to the exact same exporter path and imported export name are two local spellings of the same live ESM binding. They may be supplied as one root set to the closed-world owner proof if every local spelling is uniquely bound and all uses of every spelling are included in the proof. A root spelling that escapes, is shadowed, is re-exported, participates in dynamic import, or reaches an unproved consumer must continue to veto the rename.

## Candidate implementation

Branch: `agent3/joint-root-single-reader-20261125`

Current candidate head at this checkpoint: `20657dac130925c415211754a3794522317dae66`

Changes are limited to `src/properties.js`, `src/cross-properties.js`, `test/cross-file-reader-flow.test.js`, and `test/esm-observation-browser.js`.

- `proveLocalObject` accepts optional `additionalRootNames`.
- Every grouped root spelling must have exactly one binding. When the root set contains multiple names, all must resolve to the same lexical scope.
- Zero-argument root-return helpers, alias-set initialization, and the alias work queue recognize the complete root set.
- The existing export veto continues to reject additional local aliases that escape through exported declarations; the identifier-use proof rejects unsupported export-specifier uses.
- `renameCrossFileProperties` groups all direct named imports matching the same exporter path and export name into one proof instead of independently proving each spelling.
- The implementation deliberately does **not** port the donor's multi-slot private tuple/record carrier analysis. The existing separate-carrier fixture remains a zero-edit refusal.

## Tests added or strengthened

- One local reader receives both sibling aliases; expected one owner-property rewrite in COO, SNO, and SCO.
- An imported reader receives both sibling aliases; the same-export reader case is tested in all three modes.
- The same owner is imported using separate import declarations; expected one rewrite in all three modes.
- Publishing the second alias to `globalThis` vetoes the rewrite in all three modes.
- Re-exporting the second alias vetoes the rewrite in all three modes.
- A shadowed sibling import is not grouped with the imported owner.
- Secondary roots are followed through a local alias and a zero-argument root-return helper; an identity-return chain into an imported reader is also tested. A local-reader identity-return chain remains a conservative zero-edit case.
- Reflection through a sibling alias and same-named exports from different modules are explicit negative controls.
- Two owner aliases placed in separate private carrier slots remain refused.
- Real Chromium ESM fixtures compare original, emitted, and statically normalized module graphs for the positive local-reader case and an escaped-alias refusal.

## Evidence and open validation

- Existing current-main sibling-alias baseline: focused run `45568705106` passed its 55-case focused suite while the two sibling-alias cases still produced zero edits.
- Initial candidate focused run `45579522397` passed on Ubuntu and Windows, including the first positive/escape/shadowed fixtures in all three modes.
- Full unmodified-main baseline run `45581201445` (head `d08da6f61c8d0e72bca3b1cb02c65a80e3dbbfc7`) completed red on both platforms: Ubuntu 5,338 pass / 12 fail / 24 skipped (5,374 total); Windows 5,328 pass / 12 fail / 34 skipped (5,374 total).
- Initial candidate full run `45579742313` (head `05c400851d71bc02c07c80f6a252d83d4c1634a3`) also completed red on both platforms: Ubuntu 5,339 pass / 12 fail / 25 skipped (5,376 total); Windows 5,330 pass / 12 fail / 34 skipped (5,376 total). The exact same 12 test names failed as on the unmodified-main baseline. The candidate added two tests, both passing, and introduced no additional full-suite failure.
- The 12 known baseline failures are classified in `im-results/agent1-452835-yield-failure-classification-2026-11-24.md`: four valid fail-closed cases, four attacker-side extraction/normalization witnesses, three genuine positive-yield gaps, and one SCO fixture source-shape defect. They are not evidence of a regression in this candidate.
- A focused baseline run of `test/private-class-source-yield.test.js` on unmodified current main also failed, independently confirming that this is a pre-existing gap.
- The initial candidate's later performance and browser steps completed. Existing paired Node session profiles reported `within2point5:true` on both platforms; this does not establish the universal 2.5× budget or measure the exact new sibling-alias fixture.
- Expanded focused run `45583089001` on candidate head `20657dac130925c415211754a3794522317dae66` passed 66/66 tests on Ubuntu and Windows. Project JSDoc, external JSDoc, and paired-budget typechecks passed on both platforms.
- The Chromium sibling-alias fixtures cover a private local reader (including secondary-root alias/zero-argument return flow), an imported reader, and an escaped-alias refusal. The harness compares original, emitted, and public-field-normalized module graphs and asserts that the normalizer recovers every renamed field.
- Full manual-validation run `45583289136` is running on the current candidate head. It is expected to reproduce the known baseline 12 failures; its additional Node and Chromium fixtures must still pass before review.

## Security and performance interpretation

This change adds no runtime helper or control-flow machinery; it changes which property references are rewritten. It is expected to improve analysis coverage without introducing additional runtime operations, but exact generated-runtime profiling remains necessary.

The property tokens remain statically recoverable. The browser harness deliberately includes a public-field normalizer as an attacker control; successful normalization is evidence that property renaming alone is not a confidentiality boundary. This candidate does not establish resistance to static reconstruction, dynamic extraction, tampering, instrumentation, domain-lock bypass, or a hostile SNO runtime.

## Boundaries

The proof is limited to direct named imports of one exact exporter path and export name. It does not group default imports, re-exported owner aliases, query/fragment variants, dynamic imports, or symlink-equivalent source paths. The private multi-slot carrier case remains conservative. Existing source-observation, reflection, escape, and environment-lock limitations remain unchanged.

## Next actions

1. Compare the full baseline run `45581201445` with the candidate full run and attribute the 12 failures by exact test name.
2. Verify expanded focused Node tests and strict JSDoc on both platforms.
3. Run the full manual-validation workflow on the latest candidate head, including the new Chromium ESM parity/normalizer cases.
4. Obtain independent soundness reviews requested from Agents 7 and 50.
5. Only if the candidate adds no new failures, open a narrowly scoped review PR. Do not merge without current-main source pins, full validation, and independent review.
