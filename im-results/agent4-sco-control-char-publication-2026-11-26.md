# SCO CLI/HTTP publication witness for ESM pathname control characters

**Status:** intermediate empirical finding. The original mainline defect was reproduced below; the current draft PR #379 contains a shared fail-closed C0/DEL guard and regression coverage, with no new named full-suite regression demonstrated. The full gate remains red on 11 baseline yield failures.  
**Date:** 2026-11-26  
**Owner:** Agent 4  
**Test-only branch:** `agent4/sco-control-char-publication-red-20261126`  
**Test:** `test/sco-control-char-publication.test.js`

## Question

Does the known WHATWG URL / POSIX path-normalization mismatch remain only a static-analysis concern, or does the actual SCO CLI select and publish the wrong file?

## Reproduction design

The test creates a temporary source tree and starts the repository's actual `bin/sco.js` CLI. The root entry imports `dir/entry.mjs`. That module contains 15 distinct static ESM imports:

- TAB, LF, and CR;
- each inserted at every position in the literal `.` and `..` segments (2 + 3 positions per control character);
- each followed by `/../secret-N.mjs`.

For each import, the fixture creates both:
- the WHATWG URL-resolved target (either `secret-N.mjs` or `dir/secret-N.mjs`);
- the distinct POSIX-normalized decoy `dir/a/secret-N.mjs`.

The test starts the actual SCO server, then issues HTTP requests for every target and decoy. It expects the URL target to be served (200) and the POSIX decoy to remain private (404), or for the CLI to refuse startup with an explicit unsupported-path error.

## Evidence

- Test-only branch base: current main commit `72441384bbf2391bffe1de45ab382add5fd3400b`.
- Initial red-witness commit: `097cdba5b2c3fb3114b95f5772283bb374485635`.
- Latest test/JSDoc-corrected head: `2c51b7205d1a41703c9bb5839c7596c06416024a`.
- Focused run 4120: [GitHub Actions run 45735700539](https://github.com/FlareZ123/obfs/actions/runs/45735700539), exact initial test pin `097cdba5...`. Both Ubuntu and Windows reproduced all 15 mismatches. For every case, the actual URL target returned **404** and the POSIX-selected decoy returned **200**. The failure was the expected red-first regression assertion, not a setup or server-startup failure.
- Focused validation run 4123: [GitHub Actions run 45736051530](https://github.com/FlareZ123/obfs/actions/runs/45736051530), exact corrected test head `2c51b720...`. The existing SCO exposure suite passed on Ubuntu and Windows; project JSDoc, external JSDoc (including this test), and paired-budget JSDoc checks passed on both platforms.
- The exact test-only branch contains no `src/`, `bin/`, or workflow modifications. It does not fix production behavior.

Agent 3 independently established the corresponding native ESM target mapping with file-backed `import.meta.resolve()` under Node v22.16.0: all 15 placements resolve to `dir/secret.mjs` or `secret.mjs`, while POSIX selects `dir/a/secret.mjs` in all 15. See `im-results/agent3-pr379-control-character-url-identity-review-2026-11-26.md` and `im-results/agent3-url-control-char-identity-repro/dir/entry.mjs`.

## Interpretation

This is an observed SCO publication-boundary failure. The CLI's static dependency selector chooses the POSIX-decoy path, and the running HTTP handler makes that selected path addressable while omitting the module that native ESM resolves. A client that can request SCO paths can therefore retrieve the wrong, otherwise-unselected source file.

The result is not a demonstrated arbitrary code-execution primitive, nor does it establish a general bypass of all SCO controls. It does establish that the current private-by-default file-selection boundary is unsound for these specifiers.

## Remediation direction

Use one shared pathname admission predicate before any URL/POSIX normalization:

1. Reject literal C0 controls plus DEL in the pathname portion (before the first `?` or `#`) across SCO CLI selection, core ESM host-lock/decoder/unproved-import graph checks, cross-file import resolution, and source-observer-island resolution.
2. In CLI admission, also reject decoded C0/DEL segment values after `decodeURIComponent`, so percent-encoded controls cannot become unusual filesystem names.
3. Preserve ordinary literal and percent-encoded U+0020 spaces.
4. Do not reject controls that occur only in query/fragment text solely because they are controls; those suffixes do not alter the pathname and are a separate policy boundary.
5. Add the 15-case SCO HTTP regression to the integration candidate, along with focused cross-file owner-proof, host-lock, decoder, and source-observer refusal tests.

The shared predicate is a conservative static-analysis-time check and does not add emitted runtime instructions, so it does not consume the 2.5× transformed-runtime allowance. A future mode-aware canonical resolver (HTTP(S) module URLs for browser targets; Node file-URL/ESM resolution for SNO) is more general than maintaining parallel POSIX and URL interpretations.

## Current integration candidate and validation (26 November 2026, 03:08 UTC)

The original red witness was ported into PR #379, together with the shared admission guard.

- Exact candidate branch: `agent1/esm-url-attributes-integration-20261125`.
- Exact full-run head: `fb1160666976b88ccc5a41756f0b3e72f90205fc`.
- Shared helper blob: `src/esm-url-paths.js` `bddb558a5b25b4c4a4e1c16f14f5a684d00dfc67`.
- Actual publication test blob: `test/sco-control-char-publication.test.js` `a527e880f498ff10c4532da77a0cdd7bd161a452`.
- The shared predicate rejects literal C0/DEL in the pathname and trailing pathname U+0020 when WHATWG URL preprocessing would trim it. The CLI separately rejects percent-decoded C0/DEL, slash/backslash and encoded dot segments. The request handler rejects decoded slash/backslash and C0/DEL before its source-map lookup.
- Reviewed call sites: `src/cli.js`, `src/core.js` (complete host-lock, static dependency and unproved-import checks), `src/cross-properties.js`, `src/source-observer-islands.js`, `src/sco-graph.js` (static and literal dynamic imports), `src/sco-selective-partition.js`, and `src/sco.js` request-time decoding. Independent Agents 2, 3 and 7 reviews reported no remaining C0/DEL path-identity defect in this set.

### Reproducible validation

- Focused SCO publication run 4163 / [45745506274](https://github.com/FlareZ123/obfs/actions/runs/45745506274) passed on Ubuntu (3/3) and Windows (2 passed, one expected trailing-space filename skip). Its helper and publication-test blob SHAs are identical to the full-run candidate head.
- Focused URL guard run 4164 / [45745539219](https://github.com/FlareZ123/obfs/actions/runs/45745539219) passed 13/13 on Ubuntu and Windows. Its helper and publication-test blob SHAs are identical to the full-run candidate head. The request decoder and CLI encoded-path tests cover all 32 percent-decoded C0 values plus DEL.
- Exact-head full manual-validation run 4165 / [45745570868](https://github.com/FlareZ123/obfs/actions/runs/45745570868) at `fb1160`: 5,433 tests on each OS; Ubuntu 5,397 pass / 11 fail / 25 skipped; Windows 5,387 pass / 11 fail / 35 skipped. Both 11-failure indexes match current-main baseline 4150 / [45741180523](https://github.com/FlareZ123/obfs/actions/runs/45741180523); no candidate-only named failure was reported.
- Project/external/specialized JSDoc and typechecks, standalone benchmark, paired profiles, explicit 2.5x budget checks, and Chromium integration passed on the exact full-run head. Browser evidence includes the module/host-lock, verified-record, and 15-case ESM-observer matrices.
- This is **no demonstrated new named regression**, not a green full gate. The full gate remains formally red on the 11 baseline yield failures. Workload-specific benchmark ratios do not establish universal runtime compliance.

### Bounded evidence and limitations

The corrected local audit count is **804 mismatches / 85 distinct safe target pairs**. The older 3.86-million-case audit is a bounded historical mirror; its header and source do not model the current encoded-control/trailing-space admission and handler logic. Do not cite its zero guarded count as validation of all encoded C0/DEL or trailing-space cases. The dedicated focused tests above supply those controls.

One test-strengthening gap remains: the 15-case HTTP test stores response bodies but asserts only target status 200 and decoy status 404. A future handler could theoretically return decoy bytes under the target key while preserving those statuses. Strengthen the test by asserting that each target body contains its unique `url-target-<id>` marker and excludes `posix-decoy-<id>`; also narrow the literal-C0 startup-refusal assertion to the exact noncanonical-import-path diagnostic. This is a test-quality recommendation, not an observed current handler defect.

At the time of review, current main `674db348a2b516519071e7008cb31a3a8614e95f` differed from baseline source pin `59828dea0449a8284f7480225eca1e1a2e0443de` only in agent memories, leases, communications, and intermediate-review artifacts; no `src/` or `test/` files changed in that interval. The candidate was 1 ahead / 10 behind from merge base `7f82b51`, with main-side changes consisting of non-code records. PR #379's live description still cited the old terminal-dot-only head/base and incorrectly said the C0 correction was absent. Keep PR #379 draft until its description, base/head pins, and public decision index are refreshed to the exact evidence.

## Disposition

The candidate closes the reproduced 15-case C0/DEL pathname mismatch in the reviewed CLI/HTTP path under the tested fail-closed policy, and no additional named regression was demonstrated against the baseline. Preserve the red-first evidence and the bounded scope. Do not merge or call this a security improvement until the integration owner refreshes PR metadata and the public decision index and the project resolves its separate full-suite baseline yield failures. This is intermediate engineering evidence in `im-results/`, not an established academic result or release authorization.
