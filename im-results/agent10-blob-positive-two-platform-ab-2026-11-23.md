# Exact-source two-file Blob positive-work repair: paired full Node/Chromium acceptance (23 November 2026)

**Classification:** intermediate source-parity and complete-suite admission evidence. **Agent 10.** This is a reproducible engineering result, not a novel obfuscation theorem, hostile-runtime protection result, general JavaScript parity proof or release certificate.

## Controlled source revisions

- **Baseline** [`ea64e3bab8cff9840cb5dd8f5aec334eb3a56ab6`](https://github.com/FlareZ123/obfs/commit/ea64e3bab8cff9840cb5dd8f5aec334eb3a56ab6), immutable test branch `agent10/blob-baseline-20261123`, full two-platform `manual-validation.yml` [run 45176925442](https://github.com/FlareZ123/obfs/actions/runs/45176925442).
- **Candidate** [`1522e7407ccb529be8f1ad5e758f379dbb2b8fcf`](https://github.com/FlareZ123/obfs/commit/1522e7407ccb529be8f1ad5e758f379dbb2b8fcf), test-only branch `agent10/blob-primitive-safe-positive-20261123`, full two-platform [run 45176932784](https://github.com/FlareZ123/obfs/actions/runs/45176932784).
- The source diff between these commits changes **only** `test/blob-constructor-alias-source-observer.test.js` and `test/blob-options-function-source-observer.test.js`. There is no compiler, workflow, dependency, runtime backend or external control change in the candidate.
- Both workflows dispatched with **empty** `focused_test`: they executed the actual `node22` Ubuntu/Windows matrix. Each also had one skipped `focused` job. Their Node22 behavior steps failed, so **neither** is full green.

| Frozen run / OS | Total tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Baseline / Windows | 5,156 | 5,129 | **17** | 10 |
| Candidate / Windows | 5,156 | 5,131 | **15** | 10 |
| Baseline / Ubuntu | 5,156 | 5,136 | **17** | 3 |
| Candidate / Ubuntu | 5,156 | 5,137 | **16** | 3 |

Counts are taken from each job's `# tests`, `# pass`, `# fail` and `# skipped` summary. Complete `FAILED_TEST_INDEX` comparison confirms that the two test titles **`bound Blob constructor with primitive input retains private property rename`** and **`primitive Blob options preserve genuinely renamed private fields`** disappeared on **both** platforms. The other 15 shared failing test titles remained; all are failed positive property transformation expectations. The candidate Ubuntu job additionally reported **`generated five-state SCO and matched ordinary esbuild-minified service yield identical clones`** as `fetch failed`. The baseline Ubuntu job did not report this error. Its cause and reproducibility have not been determined, and it is deliberately kept separate from the deterministic two-fixture repair.

**The only failed named job step in both runs and both OSes** was `Behavioral and adversarial suites with compact failure diagnostics`. The strict JSDoc and performance steps passed, and all three actual Ubuntu Chromium integration steps passed. These step outcomes do not override the failing Node acceptance.

## Why the original fixtures had zero yield

Both original positive samples exported an arrow directly reading `owner.hiddenCount` and `owner.secretDelta`. The current conservative `proveLocalObject` guard declines those source edits because an external importer/holder can call `Function.prototype.toString` on the exported arrow, observing the changed source. The tests only asserted `observesFunctionSource(parse(original,'commonjs'))===false`; this local-AST observation fact cannot exclude a hostile external caller.

The corrected programs use a private, uniquely called `const privateRead=()=>owner.hiddenCount+owner.secretDelta`, while the public wrapper is `module.exports=()=>privateRead()`. Source edits occur only inside the direct-called helper; **both tests still require exactly two actually transformed owner fields**, an unchanged numeric result, and byte-exact public callable `Function.prototype.toString.call(module.exports)` between original and compiled outputs. No meaningful source-observer semantic weakening was required.

Focused CI on the same candidate pin passed independently on both platforms: [45176608445](https://github.com/FlareZ123/obfs/actions/runs/45176608445) and [45176619926](https://github.com/FlareZ123/obfs/actions/runs/45176619926), including the strict checked project JSDoc steps. These are focused receipts, separate from comprehensive failure counts.

## Next acceptance boundary

This intervention removes **two contradictory fixture contracts**, demonstrating useful private source changes under a source-visible public wrapper. It does not change obfuscator security or the root cause of the remaining 15 positive-work cases. A third source-paired private-tuple hot-session candidate and separate Symbol tests are preserved on research branches, with their own receipts. Agent 3 owns canonical compiler intake; Agent 10 owns full admission. Keep **RELEASE-BLOCKED**.

This evidence compares two distinct sources run at slightly different times on dynamic CI hosts, so residual time-varying network/benchmark results cannot be causally attributed to the test-only diff without separate reproduction.
