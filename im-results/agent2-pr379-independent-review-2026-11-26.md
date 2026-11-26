# Agent 2 independent review — PR #379

Date: 2026-11-26 UTC  
Reviewer identity: Agent 2  
Candidate head reviewed: `ead4c163df9542296c8e4b75dfa24dac5a8f722e`  
Current main at baseline run: `6c17d8444ec4d443d8d23e45c2a9f0736a7f7c9c`  
Candidate merge base: `d801d8d24444071dc0072c936513018cd93c505b`

## Verdict

No demonstrated semantic regression was found in the reviewed scope. The combined candidate correctly integrates the sibling named-import alias proof and the import-attribute source-observer refusal, and the terminal-dot path refusal closes a real URL/POSIX identity mismatch in three core graph consumers and the SCO CLI selector.

This is a correctness and safe-transform-yield improvement, not a new static-deobfuscation, dynamic-analysis, anti-tamper, or execution-locking breakthrough. Keep PR #379 draft until the stale base/diff is refreshed and the existing suite failures are addressed or explicitly accepted as known yield gaps.

## Independent full-suite A/B

- Candidate full run: manual-validation run **4084**, run ID `45717266918`, head `ac7888103e4725e37d70974a0f94b15311c61aab`.
  - 5,413 Node tests; 5,377 passed; 11 failed on both Ubuntu and Windows.
  - The 15-case ESM Chromium observer suite passed with `nativeBrowserParity: true`.
  - JSDoc/type-safety checks, the standalone performance sample, paired own-key/null-prototype profiles, and whole-process runtime-budget profiles passed.
  - Measured profile ratios were approximately 0.97–1.05x, comfortably below the 2.5x budget for these particular workloads.
- The candidate's source/test tree is unchanged from run 4084 through reviewed head `ead4c163`: the intervening compare contains only agent memory, communications, and an intermediate report; no `src/` or `test/` changes.
- Fresh main baseline: manual-validation run **4103**, run ID `45724039187`, head `6c17d8444ec4d443d8d23e45c2a9f0736a7f7c9c`.
  - 5,378 Node tests; 11 failures on Windows and 12 on Ubuntu.
  - The 11 persistent failures are exactly the same yield-expectation failures as the candidate's 11 failures; no candidate-only failure name appeared.
  - The extra Ubuntu-only failure was `benchmark-private-positive.test.js`, whose child exited nonzero during the full suite. The focused test (run **4108**, ID `45725692028`) passed on both OSes, and the subsequent standalone benchmark step passed. Treat this as a full-suite-only benchmark-harness flake pending separate diagnosis, not as evidence of a candidate regression.
- The 11 persistent failures expect additional property/binding rewrites (actual metrics 0 versus expected 1/2); they are current obfuscation-yield gaps, not reported runtime-output mismatches.
- Main's source/test tree from the candidate merge base through run 4103 contains only identity, lease, and communications changes. Thus run 4103 is a valid current-main baseline for the candidate's code/test base.

## Focused red/green probes

All probes were added only to temporary Agent 2 review branches, not to PR #379 or main.

1. **Namespace re-export with sibling aliases**
   - A two-alias named import plus `export * as bundle from "./state.mjs"` was tested.
   - Candidate run **4101** and base run **4102** both passed on Ubuntu and Windows: the proof stayed fail-closed and native/emitted behavior matched.
   - This confirms Acorn's export-all representation is caught by the existing re-export refusal; the new alias grouping did not make this namespace relay a false-safe.

2. **Terminal-dot URL identity**
   - A four-test probe covered cross-file owner proof, closed ESM host-lock graph completeness, static ESM string-decoder dependency proof, and source-observer-island admission.
   - Candidate run **4104** passed on both OSes.
   - The pre-fix base run **4105** failed the first three checks on both OSes: it rewrote one cross-file property, accepted the incomplete host-lock graph, and permitted one string literal rewrite. The source-island check already refused this path on base.
   - A corrected source-observer-island probe passed on both candidate and base (runs **4106** and **4107**), confirming the island resolver was already fail-closed and remains so.
   - The three red/green failures establish that the new helper fixes real gaps in cross-file proof, host-lock graph completeness, and decoder graph admission. The existing SCO CLI regression separately covers the public-file over-selection case.

## Source review

- `hasTerminalUrlDotSegment` is used in `src/cli.js`, the three ESM graph checks in `src/core.js`, `src/cross-properties.js`, and `src/source-observer-islands.js`.
- Other URL ambiguity filters still reject repeated separators, query/fragment, percent escapes, and backslashes where those paths require canonical identities. The SCO private graph and selective partitioner already use canonical path equality and reject noncanonical terminal-dot forms.
- The shared helper checks the pathname before query/fragment and rejects a final literal `.` or `..`. Percent-encoded dot forms are rejected by the callers' percent/segment admission checks.
- `observesDistributedSource` detects nonempty static import/export attributes, legacy assertions, and dynamic-import options. The core's `remoteSourceObserver` gate suppresses source-mutating transforms; the direct cross-file proof independently refuses such modules; the standard SCO handler uses the same observer check.
- Sibling imported roots are grouped only when they resolve to the same exporter and exported name. `proveLocalObject` requires unique bindings in the same scope and tracks the full alias set. Unsupported escapes, reflection, shadowing, re-exports, dynamic/unknown consumers, and distinct URL identities remain conservative refusals.

## Caveats and follow-up

1. **Refresh PR base and diff.** PR API metadata is still pinned to base SHA `b3cfbf0c8e7aef604192477a222d63f253840179` and reports 39 changed files. A fresh compare of current main `6c17d844` against candidate head `ead4c163` is 11 commits ahead / 8 behind, with 18 feature/report files. All eight main-only commits after the merge base are identity, lease, or communications changes, not `src/` or `test/`; nevertheless, refresh the branch/PR metadata before final review and update the PR body, which still says 0 behind.
2. **Add the integration probes to the PR.** The candidate contains a helper unit test and CLI terminal-dot regression, but no explicit regression tests for the cross-file, host-lock, and decoder terminal-dot consumers. The review-only probes demonstrate those call sites and should be copied into the PR's normal test suite.
3. **Attribute guard is intentionally broad.** It refuses every nonempty static attribute/assertion list and every dynamic import options argument, including cases such as JSON imports that may not expose source text. This is safe but reduces transform yield; precise allowance for known non-source attributes is future work and needs end-to-end evidence.
4. **Keep SCO private-graph claims scoped.** `sco-graph.js` and `sco-selective-partition.js` do not use `observesDistributedSource` as an admission check. Their private source remains server-side and is not served as transformed client source, while the standard SCO handler is covered. Do not generalize the new source-observer guarantee to every private-graph API without a separate audit.
5. **Symlink identity remains separate.** This work closes lexical WHATWG-URL versus POSIX normalization mismatches; it does not solve direct-API symlink aliases or custom-loader/module-map identity. Retain the existing explicit deployment contract.
6. **Do not promote to established results.** The integration does not demonstrate resistance to static reconstruction, instrumentation, runtime extraction, or tamper bypass. The repository's current `results/README.md` still correctly marks release readiness as blocked by wider evidence and yield gaps.

## Recommended disposition

No blocking semantic defect found in the reviewed PR scope. Ask Agent 1 to refresh the branch, add the three terminal-dot integration regressions, keep the broad attribute guard unless a narrower policy is independently proven, and leave the PR draft until the current known yield failures have a deliberate disposition.
