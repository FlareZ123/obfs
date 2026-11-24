# Independent source-observer rebind review (24 November 2026)

**Status:** intermediate, exact-pin reviewer evidence. This is not comprehensive acceptance, a security result, or release authorization.

## Exact candidate and harness

- Candidate branch: `agent3/frozen-main-rebase-20261124`
- Candidate commit: `ef457eb1b9c5db41883068fe994b7ffec91a48d1`
- Reviewer harness: `im-results/source-observer-rebind-review-2026-11-24.js`
- Harness commit: `bc6efe661daff0d3dccef2e21a548e74fdd803b0`
- Harness blob: `307dbd9082e3e3e8049542938dedbea1d7169d2c`
- Harness SHA-256 observed by runner: `527aae0a9fa4402d0dcc03fa944451b8ac0f29e94427e72685a9cd8a3b3f32b4`
- Workflow: `.github/workflows/source-observer-direct-validator.yml`, manually dispatched on `main` with the exact candidate and harness pins.
- Final run: [45415021219](https://github.com/FlareZ123/obfs/actions/runs/45415021219), Ubuntu, Node 22.23.4, conclusion **success**.
- Executed command: `node "$RUNNER_TEMP/source-observer-rebind-harness.js"`.

The workflow checked out the candidate SHA as detached HEAD, verified `git rev-parse HEAD`, fetched the harness commit separately, and executed the reviewer-owned script without modifying the candidate checkout.

## Results

All 16 post-plan mutations were rejected by both `validatePlanSemantics` and `acceptPlannedPass`:

| Mutation | Ranges mapped | Validator accepted | Pass accepted |
| --- | ---: | ---: | ---: |
| Export callable prefix | yes | no | no |
| Class binding named `Function` | yes | no | no |
| Import binding named `Function` | yes | no | no |
| Append second source reader | yes | no | no |
| Mutate `Function.prototype.toString` in source | yes | no | no |
| Destructured `Function` shadow | yes | no | no |
| `top['Function']` global-root alias | yes | no | no |
| `document.defaultView['Function']` alias | yes | no | no |
| Catch binding hiding global `top` | yes | no | no |
| Loop binding hiding global `top` | yes | no | no |
| `String.constructor` dynamic code | yes | no | no |
| Constructor-chain prototype mutation | yes | no | no |
| Computed constructor-chain mutation | yes | no | no |
| Callable-binding write | yes | no | no |
| Exported mirror overwrite | no | no | no |
| Mutable reader binding plus overwrite | yes | no | no |

The exported-mirror overwrite changes a tracked protected declarator, so the range mapper itself fails closed. The mutable-reader-binding case still maps the original spans, but the semantic validator and pass acceptance reject the altered declaration/assignment.

The producer-level disconnected-export control returned no plan:
- linked reader-result-to-export fixture: plan accepted;
- replacing `export const sourceText = observedSource` with a literal export: plan rejected.

A non-vacuous real compiler positive control also passed through `obfuscateFiles`:
- properties renamed: 1;
- bindings renamed: 2;
- string literals encoded: 1;
- observed callable source remained exact;
- native and emitted module outputs matched for `sourceText`, `result`, and `labelText`.

The final stdout ended with `SOURCE_OBSERVER_REBIND_REVIEW PASS`.

## Harness calibration history

Two earlier reviewer-harness attempts were harness errors, not candidate regressions:

- [Run 45414608612](https://github.com/FlareZ123/obfs/actions/runs/45414608612): all mutations shown in the log were rejected, but the harness incorrectly expected the mutable-reader edit to make range mapping return null. The mapper correctly preserved the range and the semantic validator rejected it. The expectation was corrected.
- [Run 45414809695](https://github.com/FlareZ123/obfs/actions/runs/45414809695): all 16 negative cases and the disconnected-producer rejection passed, but a synthetic comment-only edit was an invalid positive control for this validator path. It was replaced with the real compiler positive fixture above.

For historical comparison, the original candidate `246af59679d4388703b93fb36918d9e9b344cca1` accepted all eight pinned unsafe cases in [run 45401539337](https://github.com/FlareZ123/obfs/actions/runs/45401539337). That run is negative evidence about the original candidate, not the rebased repair.

## Scope and remaining limits

This review closes the listed finite source-visible rebind mutations at the exact candidate pin. It does not establish that the feature is safe under a hostile COO runtime. The plan still records the effective intrinsic dispatch as `unknown-or-mutable`, `effectiveOperationRef.kind='unknown'`, and `intrinsicSnapshotId=null`; the caller-provided pristine-intrinsics premise is not a trust anchor. A runtime that replaces `Function.prototype.toString` before module evaluation remains outside this source-mutation harness and requires a separately trusted intrinsic/host contract or refusal.

This run is Ubuntu-only and is not the full Node 22 Linux/Windows suite, the full Chromium integration runner, or comprehensive runtime-budget acceptance. The direct Chromium fixture and focused two-platform producer suite have separate earlier pins; they do not substitute for the full gate. Agent 10 retains sole comprehensive acceptance ownership. COO/SNO/SCO hostile-runtime security, static reconstruction resistance, and the end-to-end 2.5x budget remain unestablished. Project status remains **NO-GO / RELEASE-BLOCKED**.
