# Grouped proof for sibling imports of one ESM owner

**Status:** provisional intermediate result; no production acceptance or merge claim.

## Problem

The current-main cross-file proof collects named imports of an exported owner, but proves each local spelling independently. A local reader that is called with two local names for the same named export is not represented as one owner identity. The previous implementation also refused reader imports whenever more than one owner alias was present. The consequence is a conservative zero-edit result even when the importer contains two ordinary, unique ESM bindings for the same `(resolved exporter path, export name)`.

This is a transformation-coverage problem, not a new confidentiality result.

## Narrow hypothesis

Within one importer module, two named import specifiers that resolve to the exact same exporter path and imported export name are two local spellings of the same live ESM binding. They may be supplied as one root set to the closed-world owner proof if every local spelling is uniquely bound and all uses of every spelling are included in the proof. A root spelling that escapes, is shadowed, is re-exported, participates in dynamic import, or reaches an unproved consumer must continue to veto the rename.

## Candidate implementation

Branch: `agent3/joint-root-single-reader-main-20261125`

Current-main integration branch created from `1d98fcaec2f5c66f701208cbba3f0a7cfb220651`; source/test tree copied from candidate head `20657dac130925c415211754a3794522317dae66`.

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
- First full run `45583289136` on the pre-integration branch failed the Chromium ESM differential for the local-reader case: expected one cross-file property rewrite, observed zero. The Node proof uses a one-property owner and logs its result; the original browser fixture also used one property but exported a computed numeric result. The earlier explanation that the owner shapes differed was incorrect. The precise cause of the zero-rewrite result was not established.
- Second full run `45584911604` completed on the integration branch before the latest harness changes. Both OS behavioral suites failed; Ubuntu's ESM browser differential failed before proof evaluation because Chrome could not resolve `./state.mjs` from the served `entry.mjs` URL. The Actions log endpoint then returned 403, so detailed full-suite counts for this run could not be retrieved; the baseline and initial-candidate full-run counts above remain the independently verified comparison.
- Browser harness follow-up commits `234adf6a490826a8b91301751b36cec85a7f3516` and `c78ae93b83c1bce8241766e82a7e98fbbd6a6388` make the page import a target-specific absolute `entry.mjs` URL derived from the request host/path and add strict JSDoc typing. Commit `4c6e52d4d819e84c76afe55a631fdc132a4b4f02` now captures the entry module's `console.log` output in the page and aligns all three browser fixtures with the Node proof's one-property/console-based input shape (removing the unnecessary `auxiliaryField` and numeric export). These fixes are **unverified**. Agents 50 and 8 were asked to review/rerun them in their mailboxes.
- PR #374 remains draft. Do not merge until the absolute-URL browser harness passes a fresh full manual-validation run and the full behavioral diagnostics are available.

## Security and performance interpretation

This change adds no runtime helper or control-flow machinery; it changes which property references are rewritten. It is expected to improve analysis coverage without introducing additional runtime operations, but exact generated-runtime profiling remains necessary.

The property tokens remain statically recoverable. The browser harness deliberately includes a public-field normalizer as an attacker control; successful normalization is evidence that property renaming alone is not a confidentiality boundary. This candidate does not establish resistance to static reconstruction, dynamic extraction, tampering, instrumentation, domain-lock bypass, or a hostile SNO runtime.

## Boundaries

The proof is limited to direct named imports of one exact exporter path and export name. It does not group default imports, re-exported owner aliases, query/fragment variants, dynamic imports, or symlink-equivalent source paths. Direct API callers must honor the existing canonical `SourceFile.path` module-identity contract: preserving symlink aliases as separate direct-API files can produce a native/emitted module-identity mismatch in all modes, while the CLI rejects symlinked source entries. This is an existing API boundary, not introduced or fixed by this candidate (see Agent 7's current-main evidence in `communications/agent3/20261125T072632Z_agent7-mainline-symlink-test.md` and `...072919Z_agent7-symlink-all-modes.md`). The private multi-slot carrier case remains conservative. Existing source-observation, reflection, escape, and environment-lock limitations remain unchanged.

## Next actions

1. After Actions access/rate limits permit, run the full manual-validation workflow on the latest PR head (currently `273755142436b8e79cf71e98a896ae6d787efa23`) with `focused_test` empty. Verify the absolute-URL browser harness and read complete Ubuntu/Windows behavioral diagnostics.
2. Compare the latest full-run failure names against baseline `45581201445`; do not infer that the latest run has only the known 12 failures without its logs.
3. Obtain independent soundness/path reviews requested from Agents 7, 8, and 50. PR #374 is already open as a draft and remains unmergeable by policy until these checks are complete.
4. Investigate the local-reader identity-return chain, which remains a conservative no-edit case; preserve all existing fail-closed controls.
5. Do not mark PR #374 ready or merge until the current-head full validation and independent reviews are complete.


## 2026-11-25 11:13Z — full integration-branch validation and browser differential

- Full `manual-validation.yml` run [45602505354](https://github.com/FlareZ123/obfs/actions/runs/45602505354) completed on exact candidate source/test head `12cf58878c0a9eb235aa91a343d427627b540ddf`.
- Ubuntu: **5,348 passed / 12 failed / 25 skipped** (5,385 total). Windows: **5,339 passed / 12 failed / 34 skipped** (5,385 total). The same 12 test names failed on both platforms and match the 12 common failures in current-main baseline run [45596380389](https://github.com/FlareZ123/obfs/actions/runs/45596380389). All **11 added candidate tests passed**. The baseline Ubuntu run had one additional in-suite benchmark assertion failure; the candidate run did not reproduce it.
- The four project/external/affine-low-rank/paired-budget JSDoc checks passed on both platforms. The isolated `npm run benchmark`, paired own-key/null-prototype session profiles, and local parameter-value profiles passed. Every reported sampled ratio in those profiles was below 2.5x; this is workload-specific evidence, not a universal compute ceiling.
- Ubuntu's real Chromium steps all passed: the standard browser integration, 64-case verified-record parity, and the updated ESM observer differential. The latter reported `{"cases":9,"protectedPrivateFields":8,"observerRefusals":4,"normalizedPublicFields":8,"nativeBrowserParity":true}`. This validates the absolute entry-URL and console-capture harness on the current candidate head. The public-field normalizer successfully canonicalizes all eight renamed fields, so this remains transformation coverage rather than a static-confidentiality result.
- Current main has advanced since the baseline run, but the source/test/workflow comparison from baseline SHA `83b4546d4c3d429de940b7d332486a6fb16a40bc` to main SHA `2a43bd98bf0a4d974832e050e7105e8d7dca422b` showed only workflow, agent-state, communication, intermediate-report, and simulation-file changes; no production `src/`, `test/`, package, or `manual-validation.yml` changes. Thus the 12 common failures remain a relevant source/test baseline for this candidate.
- Full workflow conclusion is still **failure** because the 12 baseline failures remain. There is no candidate-only behavioral/adversarial failure in this run, but this is not full release acceptance and does not change the repository's RELEASE-BLOCKED decision.
- Agent 10 replied to the production-pipeline coordination request: keep the sibling-root proof and the member-flow donor separate. The latter is an experimental `workplace/` helper with no production `src/` or `bin/` changes; its own four reproduced counterexamples were repaired and its 10-case / 116-case focused suites passed, but those results are not full integration evidence. Do not merge that stale donor into PR #374.
- PR #374 remains draft. The absolute-URL/console-capture browser fix is now validated; the remaining blockers are the 12 inherited mainline failures and outstanding independent proof/path reviews. The local-reader identity-return chain remains a conservative no-edit case. Preserve all escape, reflection, re-export, source-observation, and distinct-module negative controls.


## 2026-11-25 11:28Z — local identity-return positive control

- The existing local-reader identity-return refusal used `value` as the parameter name in both `identity` and `local`. The proof inventory is name-count based and only admits a parameter alias when `bindings.get(param.name)===1`; these two distinct lexical bindings therefore share a spelling with count 2 and are conservatively excluded.
- Kept that same-spelled case as an explicit zero-edit negative control, renamed it to make the ambiguity clear, and added a positive control with unique parameter names: `identity=owner=>owner`, `local=record=>record.secretField`, called with both sibling imports through the identity helper.
- Focused run [45604762892](https://github.com/FlareZ123/obfs/actions/runs/45604762892) passed **67/67** on Ubuntu and Windows. Project, external, and paired-budget JSDoc checks also passed on both platforms.
- This demonstrates that the local-reader identity-return chain is supported when the proof can uniquely identify its parameter bindings; the prior refusal was a same-spelled-binding ambiguity, not a general identity-return limitation. No production source changed.
- Next: rerun the complete unfocused `manual-validation.yml` on the latest PR branch head (including this test-only addition), then update the PR body with the new exact head/run. Keep the 12 known baseline failures and all existing negative controls in view.
