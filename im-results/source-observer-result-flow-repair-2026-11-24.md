# Source-observer result-flow repair: executed red/green evidence (24 November 2026)

**Status:** intermediate branch evidence only; not an established result, release acceptance, or security guarantee.

## Candidate provenance

- Original reviewed candidate: `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`.
- Critic-frozen main base: `f82fbdf400f424471ad6f7e69d76d3d512ee5657`.
- Rebased working branch: `agent3/frozen-main-rebase-20261124`; latest code and measurement-harness snapshot tested `1953e278db94addf99406f6cee944d0ab459f836` (the obfuscator implementation remains the c243152 FramePosition guard; later commits update the report only). The candidate remains based on the exact frozen base above. Current main (`e829d22f885399ea76dd430384995f3766f7efd3`) is 285 commits / 227 changed files ahead of that base, but none of those changed paths are under `src/`, `bin/`, `test/`, `sims/`, or `package.json`; the divergence is repository metadata, workflows, communications, and evidence.
- PR #370 used GitHub's rebase merge to replay the candidate onto the exact frozen base. The rebase produced 58 non-empty commits; three empty commits were dropped. The original candidate branch remains preserved.
- No production mainline source-observer implementation was merged.

## Exact original-candidate red harness

Run [45401539337](https://github.com/FlareZ123/obfs/actions/runs/45401539337) checked out exact candidate `246af59679d4388703b93fb36918d9e9b344cca1`, verified that value with `git rev-parse HEAD`, fetched the pinned harness from `f82fbdf400f424471ad6f7e69d76d3d512ee5657` without changing the checkout, and executed it on Node 22.23.4 / Ubuntu.

Harness SHA-256: `5e1ecf2763b8e5c995dac53429f7122ee92e9a0d2a20f1d26ceab73adf30a6e7`.

All eight red cases were accepted by the original candidate:

| Case | Original candidate observation |
| --- | --- |
| exported callable prefix | validator accepted |
| class binding named `Function` | validator accepted |
| import binding named `Function` | validator accepted |
| appended second source reader | validator accepted |
| `Function.prototype.toString` mutation | validator accepted |
| disconnected `sourceText` export | producer accepted |
| exported mirror overwrite | validator accepted |
| mutable reader binding plus overwrite | validator accepted |

The harness exits successfully because it asserts that these unsafe acceptances are reproduced. This is negative evidence against the original candidate, not acceptance.

## Repaired-branch changes

The reanchored branch adds a narrow, opt-in first-slice source-observation plan:

1. `acceptPlannedPass` now consumes the same `MappedSourceRange[]` contract returned by `getInitialPlanRanges`, matching the core pipeline. This removes the array/Map transaction mismatch that previously prevented positive execution.
2. The plan represents the host effect's returned value separately from the observed callable. It adds explicit values, value facts, bindings and definitions for the reader-result binding and exported mirror, with two value-flow edges: host result → reader binding (assignment), and reader binding → exported `sourceText` (export).
3. The protected semantic closure now contains four tracked spans: callable declaration, direct reader call, reader-result declarator, and exported mirror declarator.
4. Post-pass validation requires a top-level non-exported callable, exactly one direct reader, a top-level `const` reader-result binding, and a top-level exported `const sourceText` alias to that exact binding. It rejects added callable syntax, added direct readers, lexical/import/class/parameter/destructuring `Function` bindings, and extra references to the tracked names.
5. Because the effective intrinsic remains unverified, the host effect carries `UnknownHostEffect` alongside the intended `ExactSource` effect; returned result/reader/export value facts have `proofStatus: 'unknown'` and `['Primitive','Unknown']` possibilities. The caller-supplied pristine-intrinsics premise is not a trust anchor.
6. Source-edit mapping now models explicit `after-node` insertion affinity at a protected span's end, matching the existing edit-map boundary test.
7. The dedicated browser fixture is invoked from `test/browser-integration.js`, so it is included by the repository's real Chromium runner.

The focused regression file includes the eight executed red cases (plus a destructured-`Function` shadow case), producer rejection of a disconnected export, exported-mirror overwrite rejection, and a direct test of the mapped-range array contract.

## Focused repaired-branch validation

[Run 45401968340](https://github.com/FlareZ123/obfs/actions/runs/45401968340) tested branch head `ed1f234747f2733879b24b4214ef2888d3b060bc`:

- Ubuntu and Windows focused Node 22.23.4 jobs both passed.
- The source-observation producer regression file passed on both platforms, including the negative rebind cases.
- Strict project JSDoc, external JSDoc, and paired/complete-suite runtime-budget evaluator JSDoc passed on both platforms.
- The comprehensive `node22` job was intentionally skipped by focused-test dispatch. This run is not a full repository validation receipt.

An earlier focused checkpoint, [run 45400924802](https://github.com/FlareZ123/obfs/actions/runs/45400924802), passed the original 13 producer cases and strict JSDoc on both platforms before the eight-case negative regression was added.

## Pass-origin, FramePosition and current browser-harness repair

The current candidate includes two follow-ups after the earlier ed1f234 focused receipt:

1. **Pass-origin and map-identity integration.** The candidate was fast-forwarded from ef457eb1b9c5db41883068fe994b7ffec91a48d1 to Agent 50's eight-commit prototype d8dde17beeaa174cb0de7f4eb0ac40fe073d7d07. This adds pass-specific synthetic-origin admission, AST-token-class checks for each admitted pass, and a process-local WeakSet brand for SourceEditMap instances. Regression tests cover untagged top-level insertion, untagged literal replacement, and a structurally copied map hiding an appended throw. The pre-integration candidate is preserved at agent3/frozen-main-rebase-20261124-pre-pass-origin.

2. **Host-visible reader FramePosition.** Agent 4's executed pre-evaluation Function.prototype.toString replacement showed that an inserted string-decoder prologue moves the reader's caller frame even when the protected source slice itself maps exactly. The plan now records the original call member token offset and checks its line, UTF-16 column, and code-point column after every candidate pass. A pass that moves this FramePosition is rolled back. Consequently, this direct-reader plan retains string literals rather than inserting the frame-shifting decoder prologue; unrelated property and identifier renames on other lines still produce positive yield. This is a narrow compatibility guard for the executed callsite-observation case, not a trust anchor or general hostile-runtime guarantee.

3. **Executed hostile-runtime regression.** The producer test now imports native and emitted modules under the same pre-evaluation replacement of Function.prototype.toString, with an Error.stack callsite suffix, CRLF line endings, and an astral Unicode comment before the reader. It requires native/emitted source-mirror parity while retaining positive property/binding yield and declining literal encoding. The test also separately verifies that the string decoder's exact mapped spans are relocatable but its FramePosition-changing transaction is rejected.

Focused run [45420004748](https://github.com/FlareZ123/obfs/actions/runs/45420004748) at c243152490394f9289e5516548d93005995711b6 passed the producer test file on Ubuntu and Windows with Node 22.23.4. Both jobs also passed strict project, external-corpus, and paired/complete-suite evaluator JSDoc. The comprehensive node22 job was intentionally skipped by focused dispatch.

The dedicated real-Chromium fixture [45420013658](https://github.com/FlareZ123/obfs/actions/runs/45420013658) passed on Chrome 157.0.8103.78 at candidate c243152490394f9289e5516548d93005995711b6. It now uses puppeteer-core to wait for the asynchronous #budget report; --dump-dom remains only for the functional native/emitted page check with virtual time. The benchmark uses paired wall-clock module-initialization samples and a paired-median bound; its workloads now intentionally retain strings because the decoder pass is declined. This is elapsed wall-time evidence, not CPU-time evidence. The authoritative results/README.md rule makes every observed strict over-2.5x pair a veto regardless of medians or confidence intervals; this fixture explicitly requires zero observed strict pair breaches for its sampled wall-time workload, but does not establish a worst-case ceiling or the required hot-function/session CPU budget.

The 31-pair sample size is not a worst-case proof. Agent 42's familywise zero-breach calculation gives an 11.2189% per-workload upper breach-frequency bound at 95% familywise confidence under the iid/representative-sampling assumption; 368 independent pairs per workload would be needed to push that frequency bound below 1%, and even that would not prove a deterministic maximum.

## Node main-thread CPU diagnostic (current candidate)

Run [45422437764](https://github.com/FlareZ123/obfs/actions/runs/45422437764) passed on Ubuntu and Windows at candidate `1953e278db94addf99406f6cee944d0ab459f836`. The harness uses Node 22 `process.threadCpuUsage()` over 512 fresh ESM imports per batch, 31 alternating native/candidate pairs per workload, and six warm-up pairs. `performance.now()` wall time is recorded separately and is not treated as compute time. It invokes the existing `familywiseBudgetBounds` helper for the two CPU workloads and fails on any observed strict CPU pair above 2.5x, independent of the median result.

| Platform | Workload | Median paired CPU ratio | Maximum observed paired ratio | Strict CPU breaches |
|---|---|---:|---:|---:|
| Ubuntu | Small, no string decoder | 1.003x | 1.108x | 0 |
| Ubuntu | Medium, 32 retained strings | 1.053x | 1.178x | 0 |
| Windows | Small, no string decoder | 0.984x | 1.660x | 0 |
| Windows | Medium, 32 retained strings | 1.005x | 1.205x | 0 |

Both platform runs returned `sample-supported` from the familywise paired-median diagnostic, with zero observed over-budget CPU pairs and zero strict placebo CPU breaches. The transform metrics were one property / two bindings / zero literals for the small workload and one property / 34 bindings / zero literals for the medium workload. The decoder is intentionally declined by the FramePosition guard, so these numbers do not measure string-decoder overhead.

Raw JSON was uploaded as 30-day workflow artifacts: Ubuntu artifact `14936130483` (`source-observer-runtime-budget-ubuntu-latest`) and Windows artifact `14934471794` (`source-observer-runtime-budget-windows-latest`), both from run `45422437764`.

The statistical assumptions remain limited: the 31 pairs are sequential alternating batches in one Node process, and independence/representativeness are not established. With zero breaches, the helper's 95% familywise strict-tail diagnostic reports an 11.2189% per-workload upper breach-frequency bound under its independent-representative-pair assumption. This is not a deterministic maximum and is not the required repeated-hot-function or sustained-session CPU qualification.

The repeated Chromium fixture [45422470318](https://github.com/FlareZ123/obfs/actions/runs/45422470318) also passed at candidate `1953e278`; it remains a separate elapsed module-initialization wall-time check, not CPU evidence.

## Full-suite integration debt

Full run [45412679635](https://github.com/FlareZ123/obfs/actions/runs/45412679635) at the pre-FramePosition candidate d8dde17beeaa174cb0de7f4eb0ac40fe073d7d07 failed on both Ubuntu and Windows with the same 12 behavioral/adversarial tests: bound-runtime-interception, bound-runtime-minifier-control, factory-object-flow, two function-declaration-reader-proof cases, interfile, COO and SNO private-class-source-yield, private-tuple-session, sco-dense-hybrid-matched-http, sno-bound-runtime-interception, and source-stable-bound-export. The Node/JSDoc, performance sample, paired six-module startup/session profiles, and native/emitted whole-process budget/public-clone steps passed. Ubuntu's full Chromium step failed because the old --dump-dom capture did not wait for the asynchronous benchmark report; the dedicated Puppeteer fixture now passes, but the full npm run test:browser integration and full manual gate have not yet been rerun at c243152.

**Source-paired frozen-base control completed.** The 10-file failure slice was run on the frozen base at [45423430520](https://github.com/FlareZ123/obfs/actions/runs/45423430520) and on the candidate at [45423442804](https://github.com/FlareZ123/obfs/actions/runs/45423442804). Both Ubuntu and Windows / Node 22.23.4 runs produced exactly 44 tests, 32 passes, and the same 12 failures listed above, with identical test names. Therefore these 12 failures are present on the frozen base and were not introduced by the candidate in this selected slice. This is a 10-file control, not a full-suite source-paired comparison. The temporary aggregator was removed from the primary candidate branch; the frozen-base control branch `agent3/frozen-base-failure-control-20261124` retains the reproducible test harness. Agent 10 retains sole comprehensive acceptance ownership; this result does not waive the baseline failures or substitute for the full gate.
## Outstanding work and limits

- The earlier pristine-intrinsics direct fixture passed in Chrome 157 on snapshot `a612e7f068e8dc1196df7b6a9747c7af35eab978` and reported one literal rewrite. That receipt is superseded for hostile-runtime semantics by Agent 4's executed caller-frame counterexample and the current FramePosition rollback guard. The current dedicated Chromium receipt is [run 45420013658](https://github.com/FlareZ123/obfs/actions/runs/45420013658); it intentionally reports zero literal rewrites for this direct-reader plan.
- Obtain Agent 2's independent review of the value-flow graph and post-pass rebind rules.
- Agent 10 retains sole comprehensive acceptance ownership. The full Node 22 Linux/Windows suite is red at the pre-FramePosition candidate with the 12 failures recorded above; a current-head rerun, frozen-base comparison, full real-Chromium integration, full failure/skip inventory, and measured runtime/yield gate remain outstanding.
- The host intrinsic is still `unknown-or-mutable`; a declared pristine-intrinsics premise does not establish trusted dispatch in COO's attacker-controlled runtime. This plan must not be described as tamper-resistant or as an attacker-proof source-observer solution.
- The product remains **RELEASE-BLOCKED**. This is a narrow experimental compatibility candidate, not a merged production implementation and not a three-mode security result.
