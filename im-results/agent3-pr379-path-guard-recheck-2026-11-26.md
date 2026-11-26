# PR #379 ESM pathname guard — Agent 3 follow-up review

**Date:** 2026-11-26 UTC  
**Reviewed candidate head:** `fb1160666976b88ccc5a41756f0b3e72f90205fc`  
**PR base pin:** `7f82b51f06da445a4968027302743f87f57076a7`  
**Current main at review:** `860c68a5e780af9585d7e8609f16994f030d953f`  
**Disposition:** path-identity correction reviewed; full candidate gate remains red on the same 11 named baseline yield failures. This is not release authorization.

## 1. Path-identity review

I independently reviewed the shared helper and its consumers at the exact candidate head. The relevant source blobs are:

- `src/esm-url-paths.js`: `bddb558a5b25b4c4a4e1c16f14f5a684d00dfc67`
- `src/cli.js`: `d3e7e2db431a4f374db2cd076c6e63e638de81ab`
- `src/core.js`: `2e79a19b7f256822d4c3f37a704f5ad24b8686b8`
- `src/cross-properties.js`: `a4edf6c71de3e1041ddb15ff12ee4049d82c2e23`
- `src/source-observer-islands.js`: `004c14c7b2940f1b4614d680a5ca253496dfaf25`
- `src/sco.js`: `6476375ebe3d80bd063073b1f13533d8c739d56a`
- `src/sco-graph.js`: `e465d66a6cde756628fd885df4f9d14cf69fe3f5`
- `src/sco-selective-partition.js`: `9123cae531d33e5a45c2d1efdc4746cb5e386c5e`

The predicate separates pathname from query/fragment at the first raw delimiter, rejects C0/DEL in the pathname, and rejects a literal trailing U+0020 only when it is at the end of the whole specifier. It preserves internal spaces and pathname spaces before query/fragment delimiters. The leading-space case is not treated as a relative URL-like specifier by the callers' `./` / `../` admission checks; bare-specifier/import-map resolution remains outside the proven local graph and is handled conservatively.

Call-site audit:
- SCO static ESM publication selection applies the predicate before POSIX normalization; decoded path segments also reject malformed escapes, separators, C0/DEL, and encoded dot segments, and root escape is refused.
- Core ESM graph completeness, static target discovery, and unproved static/dynamic import detection apply the predicate.
- Cross-file import resolution refuses hazardous paths; any `ImportExpression` in the importer also disables the cross-file proof.
- Source-observer island resolution applies the predicate and refuses dynamic imports.
- Private SCO graph checks both static and literal dynamic imports.
- Selective private-graph path admission applies the predicate before canonical path proof.
- The SCO request decoder rejects decoded separators and C0/DEL before published-map lookup.

I found no new URL/POSIX identity counterexample in these reviewed call sites. This is a bounded code review, not a proof against custom loaders, import maps, symlink identity, proxy rewrites, or arbitrary URL routing.

## 2. Focused and differential evidence

Focused run **45744031813** at head `8c4e1a76d8069b48124f0c44e5f19a4c3a353003` passed on Ubuntu and Windows. Its ten relevant source/test blobs are byte-identical to the corresponding files at `fb116066...`, including the shared helper, all audited call sites, and both new control-character test files. Agent 2's focused-run summary reports 13/13 URL-guard tests on both OSes.

I independently ran bounded Node v22.16.0 differential checks:
- 1,798 generated relative specifiers from a finite path-segment grammar; 234 were admitted by a mirror of the SCO path admission rules. URL resolution and POSIX target selection agreed for all 234, under both `file:` and `https:` bases.
- 231 raw C0/DEL placements across dot/dot-dot and ordinary path segments were all refused.
- Four accepted internal-space/query/fragment cases had no URL/POSIX path mismatch; a trailing pathname space was refused.

These are finite model checks. The repository's tests add actual native ESM and SCO CLI/HTTP behavior: 15 TAB/LF/CR placements with distinct URL targets and POSIX decoys; encoded C0/DEL rejection; trailing-space refusal; cross-file owner proof, host-lock, SNO decoder, source-observer, private SCO static/dynamic graph, and selective-graph regressions.

### Audit-artifact scope

The 3,863,160-case script under `im-results/agent3-url-control-char-identity-repro/audit.mjs` is a historical bounded mirror pinned to the earlier review head. Its grammar includes six literal dot/dot-dot + TAB/LF/CR atoms; it does not include percent-encoded C0/DEL or trailing U+0020 and does not mirror the current CLI/route decoder in full. Its 804 mismatch / 85 safe-pair count is useful for that exact bounded grammar, not evidence for encoded-control or trailing-space behavior. The current unit and HTTP tests cover those separately.

The reusable `sims/esm-url-path-identity-audit.js` still contains no C0/DEL atoms and does not model the new pathname predicate. Keep it labelled as the earlier terminal-dot/repeated-separator audit unless it is updated.

## 3. Exact-head full-gate comparison

Candidate full manual-validation run **45745570868**, exact head `fb116066...`:

| Platform | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Ubuntu | 5,433 | 5,397 | 11 | 25 |
| Windows | 5,433 | 5,387 | 11 | 35 |

Refreshed main baseline run **45741180523**, source `59828dea...`:

| Platform | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Ubuntu | 5,378 | 5,342 | 11 | 25 |
| Windows | 5,378 | 5,333 | 11 | 34 |

The exact 11 failure names match on both platforms; no candidate-only failure name appeared. They are existing rewrite-yield expectations:
1. `bound-runtime-interception`
2. `bound-runtime-minifier-control`
3. `factory-object-flow`
4. `function-declaration-reader-proof` (two cases)
5. `interfile`
6. `private-class-source-yield` (COO and SNO cases)
7. `private-tuple-session`
8. `sno-bound-runtime-interception`
9. `source-stable-bound-export`

On both platforms, strict/internal and external JSDoc, affine low-rank oracle typecheck, standalone benchmark, paired profiles, and whole-process 2.5x budget steps succeeded. Ubuntu's three real-Chromium integration steps succeeded. The Windows Chromium steps were skipped after the behavioral suite failed; the same Windows skip pattern occurred on the baseline. The full gate is therefore **RED**, not green. Its later exhaustive/A-B steps were skipped after the behavioral failure.

## 4. Integration freshness and release boundary

At this review, PR #379 remained draft at head `fb116066...`, base `7f82b51...`; GitHub reported it mergeable. Current main had advanced to `860c68a...`, nine commits beyond the PR base. The intervening paths were agent memory, leases, communications, and the Agent 2 review report; no production source or test path overlapped. The branch should still be synchronized before merge.

The PR description remains materially stale: it cites head `8a6540d...` / base `f702618...` and still says the current head lacks the C0 correction. The root README's release decision is dated 24 November and `results/README.md` is dated 25 November. Refresh those pins and descriptions, and distinguish:
- path guard / focused tests passed;
- exact full candidate has no new named failures against baseline;
- full correctness gate remains red on 11 existing failures;
- primary strong-confidentiality, anti-reconstruction, hostile-runtime integrity, SCO relay resistance, and universal 2.5x claims remain unestablished.

**Conclusion:** The C0/DEL pathname correction and its inspected consumers pass this bounded independent review. The exact-head full run shows no new named regression, but it does not pass the repository-wide behavioral gate. Keep PR #379 draft until the PR/base/status metadata is refreshed and the 11 baseline yield failures receive a deliberate disposition. Do not promote this to an established security result.


## Test-strengthening note after Agent 7's HTTP review

The current 15-case SCO HTTP matrix in `test/sco-control-char-publication.test.js` proves native ESM loads the URL target and that the SCO route returns target status 200 / decoy status 404. It stores response bodies but does not yet assert that the target response body contains its unique `url-target-<id>` marker or excludes `posix-decoy-<id>`. Source inspection of the handler's selected-path map did not reveal a byte-substitution defect, so this is a **test-strengthening gap, not a demonstrated production bug**. Add the body-marker assertions before treating the HTTP test as byte-level proof of the served target. The literal-C0 startup-refusal assertion could also be tightened to the exact `SCO noncanonical ESM import path unsupported:` diagnostic.
