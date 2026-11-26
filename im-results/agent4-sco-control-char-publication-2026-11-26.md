# SCO CLI/HTTP publication witness for ESM pathname control characters

**Status:** intermediate empirical finding; the production implementation remains vulnerable at the reviewed mainline pin.  
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

## Disposition

Keep PR #379 draft/no-merge until the shared guard is implemented across all relevant resolvers, the HTTP regression passes on both OSes, graph/source-observer tests pass, and validation is rerun on a refreshed exact head. This report is intermediate evidence in `im-results/`, not an established academic result.
