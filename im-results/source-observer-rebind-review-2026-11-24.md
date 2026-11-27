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


## Additional acceptance state at the same candidate pin

The focused manual-validation workflow [45411591700](https://github.com/FlareZ123/obfs/actions/runs/45411591700) checked out the same candidate SHA \`ef457eb1b9c5db41883068fe994b7ffec91a48d1\`. The source-observation producer test file reported 16 tests on both Ubuntu and Windows, but **strict project JSDoc failed on both platforms**:

- \`src/source-observation-plan.js(605,62)\`: implicit-any callback parameter \`element\`;
- \`src/strings.js(143,86)\`: local edit object type omits \`syntheticOriginId\`.

The workflow's comprehensive \`node22\` job was skipped by focused-test dispatch. Agent 39 prepared a two-commit JSDoc-only fix branch \`agent39/jsdoc-fix-source-observer-20261124\` (two files, one type correction each), but that fix is not part of the reviewed \`ef457...\` pin. Thus the direct harness green does not imply the candidate pin passes strict typechecking.

The current candidate's \`sims/source-observer-runtime-budget.js\` (blob \`ff512f79e02204f7eb8e06bfa654329089fe5d20\`) reports a paired median but gates on ratio-of-independent-medians; see the separate Agent 4 budget-method broadcast. It does not yet use the existing distribution-free \`sims/paired-budget-bound.js\` helper's paired-median confidence interval and decision. The browser virtual-time benchmark was separately observed to quantize samples at roughly 10 ms. Agent 39's alternative validation-only CPU/browser measurements report population-median bounds supported but strict observed sample breaches and placebo outliers; these are not clean 2.5× acceptance receipts. The whole-workload 2.5× requirement therefore remains **unestablished**.

These are separate from the rebind result: the rebind harness establishes only that the enumerated source-visible mutations are rejected at the exact pin. It does not override JSDoc, full-suite, browser-integration, runtime-budget, or hostile-runtime blockers.


## Pre-evaluation hostile-host intrinsic mutation reproduction

A separate exact-checkout harness demonstrates why the unresolved host-intrinsic status is material under the COO attacker model:

- Candidate: \`ef457eb1b9c5db41883068fe994b7ffec91a48d1\`.
- Harness: \`im-results/source-observer-host-intrinsic-boundary-2026-11-24.js\`.
- Harness commit: \`626405e4386e7869f3e33340e4e2415730462b17\`.
- Runner SHA-256: \`27624fe1ff5196c4ef75651ad88d9a33d05dbfbe904133c052cc94292fdac696\`.
- Exact-checkout run: [45416544412](https://github.com/FlareZ123/obfs/actions/runs/45416544412), Ubuntu / Node 22.23.4, success.

The harness first obfuscated the linked fixture under the normal runtime and confirmed native/emitted \`sourceText\` equality. It then replaced \`Function.prototype.toString\` **after compilation but before module evaluation** with a host function that returns the native function source plus the caller's stack line/column. Under that attacker-controlled runtime:

- native module: \`function observed() { return 29; }|callsite=4:52\`
- emitted module: \`function observed() { return 29; }|callsite=6:52\`

The candidate still produced positive transformation yield (\`properties:1\`, \`bindings:2\`, \`literals:1\`), but the source-mirror export differed. The extra decoder prologue shifted the caller location observed by the patched host intrinsic. This is a concrete semantic divergence under a pre-evaluation host mutation, not a source-visible mutation.

This is consistent with the plan's explicit \`unknown-or-mutable\` host dispatch and null \`intrinsicSnapshotId\`; it confirms that the caller's \`pristineIntrinsicsPremise\` is not enforceable evidence. For security-sensitive COO under the stated attacker-controlled-runtime threat model, either the path must fail closed when intrinsic dispatch cannot be trusted, or a trust anchor outside the client runtime must be supplied. The current candidate is a compatibility experiment only, not a tamper-resistant or attacker-resilient source-observer solution.


## Independent verification of the integrated pass-origin and FramePosition repairs

The code candidate advanced from \`ef457...\` through the pass-origin/map-brand integration and FramePosition guard to **\`c243152490394f9289e5516548d93005995711b6\`**. The branch head later advanced to \`3053d0f5507ee1f04faad4658befa582e02d9f64\`; the only difference from the tested code candidate is a report update under \`im-results/\` (no source/test/runtime code change).

At exact code pin \`c243152...\`, three reviewer-owned runs passed:

1. [Run 45420106364](https://github.com/FlareZ123/obfs/actions/runs/45420106364), harness commit \`65960b4fa71c9204979b59e8e764abeaebc6eb43\`, runner SHA-256 \`d744ed3b8cdf100665f8c871b79ebb1886e1f499712db08461c6654eee1ccadb\`. All 16 source-visible mutations and the disconnected producer export were rejected. The real compiler positive control retained properties/bindings, rolled back string encoding (\`literals=0\`), preserved exact callable source, and matched native exports.
2. [Run 45420260402](https://github.com/FlareZ123/obfs/actions/runs/45420260402), harness commit \`54d044475a9bdde93ca56c36481157d6c7943a73\`, runner SHA-256 \`fbb2c7ddff914d1659b54b3d3384b6e6bc2cc16bc16f5a5f0cb4e608eeff9e90\`. Untagged top-level throw, untagged unprotected literal replacement, and structurally forged map were all rejected. The structural validator itself also rejected the throw after the FramePosition guard. Positive compiler control: properties 1, bindings 2, literals 0, output parity true.
3. [Run 45420250032](https://github.com/FlareZ123/obfs/actions/runs/45420250032), harness commit \`6e1957c52cb314664965e6f6f9da0607567500da\`, runner SHA-256 \`58e3d3306dbd93ee56143bee7abf8844a23a09c48285997c7cbf3b9152a9d727\`. Under both the hostile \`Function.prototype.toString\` stack-location patch and hostile \`String.fromCharCode\` patch, native/emitted source and exports remained equal. The candidate retained properties 1 and bindings 2 while declining the decoder (\`literals=0\`).

The two host patches had been independently reproduced against the pre-guard \`ef457...\` candidate:
- [Run 45416544412](https://github.com/FlareZ123/obfs/actions/runs/45416544412): hostile \`Function.prototype.toString\` observed native reader callsite \`4:52\` versus emitted \`6:52\`, changing the source-mirror export.
- [Run 45419790376](https://github.com/FlareZ123/obfs/actions/runs/45419790376): hostile \`String.fromCharCode\` left native \`labelText='safe-literal'\` but changed emitted \`labelText\` to \`'XXXXXXXXXXXX'\`.

The latest FramePosition guard therefore closes these two *tested* host-mutation cases by rolling back the frame-shifting string-decoder pass. This has a real obfuscation-yield cost: this fixture now reports zero literal rewrites. It is still only a narrow guard; arbitrary \`UnknownHostEffect\` behavior remains unverified and no hostile-runtime security guarantee is established.

Agent 3's focused two-platform workflow [45420004748](https://github.com/FlareZ123/obfs/actions/runs/45420004748) passed producer tests and strict project/external/paired-evaluator JSDoc on Ubuntu and Windows at the same code pin. The dedicated Chrome 157 workflow [45420013658](https://github.com/FlareZ123/obfs/actions/runs/45420013658) passed its functional fixture and module-init wall-time smoke test. These are focused receipts only. The comprehensive run [45412679635](https://github.com/FlareZ123/obfs/actions/runs/45412679635) at the earlier \`d8dde17...\` pin remains red with 12 behavioral/adversarial failures; there is no comprehensive current-head acceptance receipt. Agent 10 retains sole acceptance ownership.

## Corrected 2.5× policy

My earlier recommendation to use only \`pairedBudgetBound(...).decision==='supported'\` was insufficient. I have reopened authoritative \`results/README.md\` lines 61–67: **every observed strict over-2.5× pair is a veto**, regardless of passing medians or confidence intervals. A caller of \`familywiseBudgetBounds\` must require both \`verdict==='sample-supported'\` and \`observedSampleHasOverBudgetPair===false\` (equivalently \`observedOverBudgetPairs===0\`). The helper's median verdict alone does not implement the hard veto.

The inferential interval also assumes independent representative pairs. Thirty-one sequential imports in one Node process or one browser page are not automatically iid; JIT tiering, GC, cache effects, and process drift can induce serial dependence. Fresh-process pairs or a preregistered process/block design are needed before treating the nominal order-statistic coverage as attained.

The browser fixture now requires zero observed strict pair breaches and reports paired module-init wall time, but it is not CPU time and not the required source-coincident suite of repeated hot functions, short/sustained whole sessions, and genuine SCO client-side network/authorization costs. The separate \`sims/source-observer-runtime-budget.js\` still gates on ratio of independent medians and does not use \`familywiseBudgetBounds\`; it is an unexecuted smoke script and must not be treated as acceptance. The 2.5× objective remains **unestablished**.


## Subsequent Node CPU diagnostic update (branch head 1953e278)

The previous note that \`sims/source-observer-runtime-budget.js\` still used a median-only wall-time gate is now superseded. Branch head \`1953e278db94addf99406f6cee944d0ab459f836\` modifies the simulation/report after code pin \`c243152...\`; the compare shows only \`sims/source-observer-runtime-budget.js\` and \`im-results/source-observer-result-flow-repair-2026-11-24.md\` changed, so the source/test code candidate remains \`c243152...\`.

The revised Node diagnostic now uses \`process.threadCpuUsage()\` for main-thread CPU, retains \`performance.now()\` as a separate wall-time diagnostic, runs 512 fresh ESM imports per batch, uses \`familywiseBudgetBounds\`, and asserts both no observed strict CPU pair above 2.5× and a sample-supported paired-median interval. It also explicitly labels the 31 sequential same-process pairs as non-independent/unrepresentative diagnostics. Agent 42 independently reviewed this update and agreed the strict veto is wired correctly.

This resolves the prior median-only-gate objection for the revised script, but the diagnostic has not yet been executed. It remains two synthetic one-shot module-init workloads in one Node process; it does not satisfy repeated hot-function, short/sustained whole-session, browser COO CPU, or SCO network/authorization coverage. It is not comprehensive runtime-budget acceptance.
