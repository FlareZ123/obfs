# Agent 2 independent review — PR #379

Date: 2026-11-26 UTC  
Reviewer identity: Agent 2  
Initial candidate head reviewed: `ead4c163df9542296c8e4b75dfa24dac5a8f722e`  
Refreshed PR head: `8a440c3c62c1be095d7bfc02c7c248f175eb6be1`  
Current PR base at refresh: `e9f689fb6f9bc159856ccf284cb3a52007a81c23`  
Full-suite baseline head: `6c17d8444ec4d443d8d23e45c2a9f0736a7f7c9c`  
Original candidate merge base: `d801d8d24444071dc0072c936513018cd93c505b`

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
- The 11 persistent failures expect additional property/binding rewrites (actual metrics 0 versus expected 1/2); they are current obfuscation-yield gaps, not reported runtime-output mismatches. Three of them are the bound-target group: `bound-runtime-interception`, `bound-runtime-minifier-control`, and `source-stable-bound-export`. A review-only diagnostic on current main (run 4110 / ID `45727032859`) found `observesFunctionSource=false`, `observesDistributedSource=false`, but `proveLocalObject=null` and local/full property metrics 0 for both a bound-arrow export and a direct exported-function control. The refusal is in `src/properties.js`'s `privateFunctionNodes` rule: a function value is treated as private only when every non-declaration use is a direct call; `internal.bind(null)` is not admitted. Agent 10's proposed 0-or-2 browser-gate adaptation is diagnostic only, not an acceptance/security fix. A future narrowly proved `BoundFunctionCreation` effect could allow an immutable target used only as the receiver of intrinsic `bind`, while preserving fail-closed behavior for aliases, source observers, mutated intrinsics, unsafe bound arguments, and other escapes. No production change was made.
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

1. **Branch sync completed; PR body still needs refresh.** Agent 1 synced the branch with current main and added a merge commit at `179bfd90`; the PR API now has base `e9f689fb` and a fresh compare of 14 ahead / 0 behind with 20 files. The PR body still cites old head `ead4c163`, old base `d801d8d2`, and 11 ahead / 0 behind / 18 files. Update its source pins, diff count, and validation section before final review.
2. **Callsite integration tests now added.** Agent 1 added `test/esm-url-terminal-dot-callsite.test.js` in the refreshed PR head. It covers the three red/green callsites from the review-only probe: cross-file owner proof, host-lock graph completeness, and static ESM decoder admission. Updated-head focused run 4111 / ID `45727635672` completed: all three terminal-dot tests passed on both Windows and Ubuntu. The run then failed `typecheck:external` because the helper return type widened `sourceType: 'module'` to `string` (TS2345). Agent 2 added the explicit JSDoc return type in commit `d98f51335160ebe0ac446bfccc65d8048c7927ac`; Agent 1 merged it into refreshed head `8a440c3c`. Follow-up focused run 4115 / ID `45728849600` was queued at the latest check. The source-observer-island path was already fail-closed on base and remains so.
3. **Attribute guard is intentionally broad.** It refuses every nonempty static attribute/assertion list and every dynamic import options argument, including cases such as JSON imports that may not expose source text. This is safe but reduces transform yield; precise allowance for known non-source attributes is future work and needs end-to-end evidence.
4. **Keep SCO private-graph claims scoped.** The separate APIs do not use `observesDistributedSource` as an admission check, but Agent 3's diagnostic `test/sco-graph-import-attribute-diagnostic.test.js` (run 45675391908) shows the generic private graph either rejects the attributed import or accepts it while retaining exact SHA-256 digests for both entry and target source and emitting only a client RPC facade with neither the import nor source canary. The selective partitioner rejects both used and unused attributed default imports in its tested named-import-only contract. This is not the same source-byte exposure path as the standard SCO handler; no leak was demonstrated. Custom loader semantics remain untested. Do not generalize the main observer guarantee to every private-graph API without citing this separate admission/output evidence. `sco-graph.js` and `sco-selective-partition.js` do not use `observesDistributedSource` as an admission check. Their private source remains server-side and is not served as transformed client source, while the standard SCO handler is covered. Do not generalize the new source-observer guarantee to every private-graph API without a separate audit.
5. **Symlink identity remains separate.** This work closes lexical WHATWG-URL versus POSIX normalization mismatches; it does not solve direct-API symlink aliases or custom-loader/module-map identity. Retain the existing explicit deployment contract.
6. **Do not promote to established results.** The integration does not demonstrate resistance to static reconstruction, instrumentation, runtime extraction, or tamper bypass. The repository's current `results/README.md` still correctly marks release readiness as blocked by wider evidence and yield gaps.

## Recommended disposition

No blocking semantic defect found in the reviewed PR scope. Agent 1 has refreshed the branch and added the three terminal-dot callsite regressions. Remaining review housekeeping is to update the PR body and confirm run 4111; keep the PR draft while the 11 known yield failures have no deliberate disposition.
