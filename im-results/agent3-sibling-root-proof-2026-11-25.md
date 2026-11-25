# Same-export ESM sibling-import root proof

<badge>Intermediate research — PR #374 remains draft</badge>

## Scope

This contribution extends the existing closed-world cross-file property proof to handle multiple local names for the same named ESM export within one importer. `src/cross-properties.js` groups direct `ImportSpecifier` bindings by resolved exporter path and exported name, then supplies the aliases to `proveLocalObject` in `src/properties.js` as a single root set.

The proof admits the group only when every root identifier has exactly one binding and all roots occupy the same lexical scope. The existing alias/reader analysis then follows the complete root set through supported local assignments, calls, and returns, while retaining the existing escape, reflection, export, source-observation, and unsupported-flow refusals. The transformation is static-only: it adds no runtime helper or initialization work.

This is a narrow correctness/capability improvement, not a new anti-analysis boundary. It does not by itself improve resistance to static reconstruction, dynamic instrumentation, or runtime extraction.

## Reproducible validation

- Focused cross-file reader suite: run [45622982666](https://github.com/FlareZ123/obfs/actions/runs/45622982666), 70/70 passing on Ubuntu and Windows, with project and external JSDoc checks passing. The exact source/test commit for that focused run was `1ad0e269939011962c8974a84ec821c7985464dd`.
- Full validation after the browser comparator repair: run [45629037951](https://github.com/FlareZ123/obfs/actions/runs/45629037951), candidate head `374ec38bc05a98f30f8e2e4ec035bb694eaa3dea` (the branch was refreshed onto main `5917d5...` before dispatch). The overall workflow is red because the behavioral suite still contains baseline failures; it is not a clean release gate.
- Full-suite counts on that candidate head: Ubuntu 5,354 passed / 13 failed / 25 skipped; Windows 5,346 passed / 12 failed / 34 skipped. The 12 common failures are the previously recorded mainline gaps in bound-runtime interception, factory object flow, function-declaration readers/public-only normalization, private-class and tuple profiles, dense SCO, live SCO RPC, SNO bound runtime, and source-stable bound exports.
- The additional Ubuntu `test/interfile.test.js` failure is also a current-main baseline issue, not a candidate regression. Focused run [45630823630](https://github.com/FlareZ123/obfs/actions/runs/45630823630) against unmodified main `822ad712a19a018cb807af186f8450aac28ff1a6` fails the same test on both Ubuntu and Windows at the same expected-one/actual-zero assertion.
- TypeScript/JSDoc checks, affine-oracle and paired-budget typechecks, benchmark samples, verified-record session profiles, and local-parameter profiles completed successfully in the full run. The measured benchmark ratios ranged from 0.571x to 1.083x; captured session/local-parameter ratios were also below 1.1x. These are workload-specific paired measurements, not a universal 2.5x guarantee.
- Chromium standard integration and verified-record browser validation passed. The corrected ESM observer differential reported `cases=9`, `protectedPrivateFields=8`, `observerRefusals=4`, `normalizedPublicFields=8`, and `nativeBrowserParity=true`.

## Browser comparator corrections

Agent 8 identified that the earlier browser harness was not valid semantic evidence: six of nine fixtures exported a `value` but never logged, so the page compared empty strings; the remaining three flattened arguments with `args.join()`. Run `45602505354` must not be cited as proof of browser parity.

An intermediate repair changed the three custom fixtures to export their computed result. That changed the static proof's eligibility and correctly caused a conservative zero-renames refusal, so run `45623978009` failed at the fixture's expected rename count before exercising the browser graph. The final harness preserves the original fixture shape: six matrix fixtures expose their `value` export, while the three custom sibling-alias fixtures retain their original `console.log` calls. The page captures the full argument array and JSON-serializes it; it no longer flattens values with `join()`. The resulting nine-case Chromium differential passes in run `45629037951`.

The host-numeric fixture uses a known in-graph host shim. It does not establish support for arbitrary page-owned callbacks or opaque host objects.

## Cyclic ESM negative control

The two-module owner-reader cycle now has a genuine reentrant temporal-dead-zone read. Native Node output is `ReferenceError 23`. The compiler conservatively returns `crossFile.properties=0` for this cyclic shape, so the test asserts the native output and expects no property rewrite in COO, SNO, and SCO. This is a fail-closed negative control, not a positive capability claim.

## What the evidence does and does not establish

- The public-field normalizer canonicalizes generated property tokens to stable placeholders for comparison. It does not recover original source property names, local identifiers, or program structure. This is a public-observation comparison, not a confidentiality result.
- The proof remains limited to supported direct named imports and the exact resolved exporter/export-name relation. Namespace imports, untracked re-exports, dynamic/unknown consumers, reflective observation, escapes, and cyclic flows remain conservative refusal boundaries.
- Repeated separators in relative import specifiers can be normalized to one `SourceFile.path` while producing distinct browser URL module-map keys. No false-safe has been demonstrated, but this remains an open compatibility question. Do not claim general URL-identity equivalence.
- Import attributes/assertions are not explicitly guarded in this candidate. Agent 7 was asked to establish whether the current parser/runtime admits a valid differing-attribute case; do not add a speculative guard without a red-first example.
- The direct-API symlink identity mismatch is an existing canonical-`SourceFile.path` contract issue documented by Agent 7; the CLI rejects symlink inputs. This PR does not solve it.
- FramePosition/source-coordinate observations and arbitrary host callback ownership remain outside this PR's proven scope.
- The measured runtime profiles cover selected workloads only. They do not establish the 2.5x ceiling under all modes, long-running workloads, network latency, or hostile instrumentation.

## Current disposition

PR #374 remains draft. The focused feature tests and corrected Chromium differential pass, and no candidate-specific full-suite failure has been established. The repository's existing behavioral baseline remains red, including the independently reproduced four-file `interfile.test.js` gap. Keep this material in `im-results/`; it is not an established academic result and should not be promoted to `results/` until the broader evidence and baseline are resolved.
