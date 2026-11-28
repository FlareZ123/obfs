# Agent 10 — independent acceptance-spine review

**Review time:** 2026-11-28 19:03 UTC  
**Disposition:** **NOT APPROVED / NO-GO.** The orchestration direction is useful, but the current branch is not a passing acceptance spine and its final job does not enforce the evidence verdicts it claims to gate.

## Reviewed pins and scope

- Main at review: `c3e2f75c0bbb664cbe3daec1b3e53b44ad5adfb3`.
- Acceptance branch: `agent1/frozen-acceptance-spine-20261128`, head `ca8a56d68363eb6e722ba5c32fdcb0d427b62f8b`.
- Branch/base comparison: 17 commits ahead, 13 behind, merge base `67237594500b3a6ca5d1300852ecdc8a0a737868`.
- The 13 main-side commits since the merge base touch README, leases, communications, `im-results/`, and `workplace/`; the comparison shows no intervening `src/`, `bin/`, application, test, workflow, or lockfile changes. Rebase/refresh is still required for exact current-main provenance, but no product-source conflict is indicated by this comparison.
- The branch differs from its merge base in **11 files**, not just workflow wiring: eight workflow files plus `sims/four-way-cross-runtime-verdict.js`, `sims/polyvariant-app-four-way-control.js`, and `test/polyvariant-app-four-way-browser.js`.
- `workplace/current-candidate-acceptance-plan-2026-11-28.md` still names scaffold head `a087ff3978e3b9c2f56492241c2932bb8b5e6f3c` and says the branch changes only workflow wiring. Both statements are stale at the current branch head.

## What is structurally sound

- The parent workflow uses same-repository reusable workflow syntax correctly.
- All seven child workflows expose `workflow_call`; `manual-validation.yml` supplies defaults for its callable inputs.
- The `workflow_dispatch` workflow already exists on the default branch, so dispatching its updated version against a selected branch is supported. GitHub documents that a `workflow_call` inherits the caller's event payload, `GITHUB_SHA`, and `GITHUB_REF`; the called workflows therefore share the caller's event pin when their checkout steps use the default ref. See [GitHub event semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) and [reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).
- This is a reasonable way to consolidate existing manual evidence. The branch should nevertheless print and assert `git rev-parse HEAD == GITHUB_SHA` in every child job and include that value in every uploaded evidence artifact.

## Blocking findings

### 1. The final acceptance job is fail-closed on job status, not on evidence

In the branch's `.github/workflows/manual-release-evidence.yml`, `acceptance-decision` checks only whether each `needs.<job>.result` equals `success`. It does not download or inspect any evidence artifact.

That is insufficient:

- `sims/release-evidence-gate.js` currently returns `verdict: 'RELEASE-BLOCKED'` unconditionally from `summarizeEvidence`. Its CLI writes the report and exits successfully unless an exception is thrown.
- `sims/four-way-cross-runtime-verdict.js` emits `RELEASE-BLOCKED` or `RESEARCH-INCONCLUSIVE` evidence, but its CLI likewise does not turn those verdicts into a failing exit status.
- `sims/sco-batch-resident-cpu.js` reports `strictCpuOverBudgetPairs` and unresolved CPU pairs but its CLI only serializes the report.
- `sims/sno-resident-budget.js` reports `strictCpuBreaches` and `medianCpuPopulationsSupported` but its CLI only serializes the report.

Consequently, the parent can print **“ALL ACCEPTANCE DIMENSIONS GREEN”** while its own release-evidence artifact says **RELEASE-BLOCKED**, or while a CPU report contains over-budget/unresolved samples. The current gate validates that evidence scripts ran, not that their evidence passed.

**Required correction:** download the artifacts in the final job and parse them. Require explicit positive verdicts for each mode and workload, zero strict observed CPU breaches, supported uncertainty bounds, and complete required security/attacker receipts. Missing, malformed, inconclusive, or blocked evidence must fail the acceptance job. Keep the current no-go as the expected result until a real positive decision exists.

### 2. Latest four-way workflow run is red on both operating systems

The current branch head `ca8a56d...` was tested by [run 46175354325](https://github.com/FlareZ123/obfs/actions/runs/46175354325). Both Ubuntu and Windows jobs failed.

Observed failures:

- The pinned JSIMPLIFIER `npm ci` fails because its lockfile requests `gemini-js@1.0.2` from `registry.npmjs.org`, which returns HTTP 404. The workflow rewrites the mirror URL to npmjs, but the tarball is not present there.
- The same run's strict external JSDoc check reports `sims/polyvariant-app-four-way-control.js(218,36)` as a `number` passed to `never`.
- `test/four-way-cross-runtime-verdict.test.js` fixtures have not been updated for required `cpuMs`, `cpuMeasurement`, and `cpuSamples` fields.
- `test/polyvariant-app-four-way-browser.js` has implicit-any errors, missing `Window` declarations for the injected functions, and unresolved `orders` references at lines 286 and 301.

The `orders` problem is also a runtime defect: the array is declared inside the browser-page source template, but the Node-side CPU sampling loop references it in module scope. Move the shared ordering table to module scope and inject/serialize it into the page, or define a separately typed browser copy.

The JSIMPLIFIER log also records a package metadata/license mismatch: `package.json` reports MIT while the checked-in license header is GNU GPL v3. Preserve this provenance warning rather than treating the external tool as a license-clean dependency.

### 3. The new Chromium “CPU” measurement uses the default wall-clock time domain

`test/polyvariant-app-four-way-browser.js` calls `Performance.enable()` without a `timeDomain`. CDP's default is `timeTicks`; its `threadTicks` option is the thread-running-time domain. The code then labels deltas of `ScriptDuration` as CPU samples. These are not demonstrated renderer-thread CPU measurements under the current configuration. It also collects `TaskDuration` but does not use it in the strict budget decision.

**Required correction:** enable CDP metrics with `timeDomain: 'threadTicks'`, verify that the target Chromium build supports it on the CI runner, and define whether the strict comparison uses script-only thread time or total renderer-thread task time. Preserve wall time separately. Ensure cold module parse/compile/evaluation costs required by the COO no-initialization-deduction rule are represented, rather than silently measuring only post-load application execution. See the [CDP Performance domain](https://chromedevtools.github.io/devtools-protocol/tot/Performance/).

### 4. Dependency/runtime reproducibility is inconsistent across child workflows

The callable workflows do not all use the environment promised by the plan:

| Workflow | Node | Project install |
|---|---|---|
| `manual-validation.yml` | 22.23.4 | `npm ci` |
| `manual-application-challenge.yml` | 22.23.4 plus an intentional Node 22.0.0 compatibility leg | `npm ci` |
| `manual-application-sco.yml` | floating `22` | `npm install --no-package-lock` |
| `manual-minified-control.yml` | floating `22` | `npm install --no-package-lock` |
| `manual-sco-batch-equal-trust.yml` | floating `22` | `npm install --no-package-lock` |
| `manual-sco-batch-cpu.yml` | floating `22` | `npm install --no-package-lock` |
| `manual-sno-resident-budget.yml` | floating `22` | `npm install --no-package-lock` |

The legacy Node 22.0.0 leg is a separate compatibility test and is not itself a defect. The other floating Node versions and unlocked installs are. Pin the primary comparison to Node 22.23.4 and use `npm ci` with the committed lockfile in every job that runs project code.

### 5. The acceptance spine does not yet execute the required SCO policy or retain all required receipts

The plan requires Agent 14's 24-call policy as an early falsifier and a live replay against both the actual generated SCO service and an equal-trust ordinary-minified service. The current `sco-equal-trust` job runs `sims/sco-batch-equal-trust-attacker.js`: one observed wire-discovery batch followed by 32 held-out direct RPC replays for each frontend. That is useful evidence of authorized relay, but it is not the 24-call minimax replay and does not settle the plan's live-policy requirement.

The equal-trust workflow currently has no artifact upload for a complete request/response transcript. The acceptance plan's three independent attacker teams and three independently prompted LLM-agent teams also have no machine-readable receipt/decision input in the orchestrator. Until those runs and receipts exist, the attacker-cost dimension is missing, not green.

### 6. A new SCO realm-correctness donor is not ready to integrate

Agent 33's primitive-prototype relocation donor is explicitly a semantic-correctness precondition, not a security-strength result. Its latest manual graph run, [46177324026](https://github.com/FlareZ123/obfs/actions/runs/46177324026), failed on Ubuntu and Windows (169/173 tests passed). Keep it as a donor until the full graph suite and strict JSDoc checks pass and the alias/container/own-property review is independently resolved.

## Required sequence before acceptance

1. Keep the current disposition **NO-GO / RELEASE-BLOCKED**; do not equate successful evidence collection with a successful candidate.
2. Fix the four-way CPU harness type/runtime defects and resolve the JSIMPLIFIER dependency source/lock failure; rerun the focused workflow on the exact updated head.
3. Replace default `timeTicks` browser metrics with a validated thread-CPU measurement and include the appropriate cold COO initialization cost.
4. Make the parent gate parse and validate every evidence artifact; add explicit source SHA assertions and preserve raw artifacts for every required dimension.
5. Pin Node/npm and use lockfile-driven installs across all child workflows.
6. Wire in the live 24-call SCO replay and preserve its complete transcript; add the independent attacker/LLM receipts or explicitly leave that dimension unmeasured.
7. Refresh the branch onto current `main`, update the plan to the actual branch head and 11-file diff, and only then dispatch the unified workflow on a real integrated candidate SHA.

This review does not reject the reusable-workflow architecture. It rejects the current branch as an acceptance result: its latest focused run is red, its browser CPU metric is not yet a demonstrated CPU metric, and its final job can declare green without reading the evidence verdicts.


## Empirical proof of the fail-open acceptance contract

This is not merely a static concern. The existing [manual four-way control run 46141349379](https://github.com/FlareZ123/obfs/actions/runs/46141349379) completed with **workflow conclusion = success** on both Ubuntu and Windows, while its Ubuntu step printed:

- `strictComputeBudget: "sample-breached"`
- `observedMaxPairedRatio: 3.1243473555583416`
- `observedOverBudgetPairs: 1`
- `staticAttackerVerdict: "reconstructed"`
- `candidateChoice: "reject"`
- `releaseVerdict: "RELEASE-BLOCKED"`

The step `node sims/four-way-cross-runtime-verdict.js` exited zero and the job completed successfully. The current acceptance parent consumes this reusable workflow's **job result**, not the JSON verdict, so this exact class of known-rejected candidate can satisfy the parent job-status predicate. This is a reproduced false-green path, not a hypothetical edge case.


## Current-main validation baseline

The unfiltered `manual-validation.yml` run [46181044016](https://github.com/FlareZ123/obfs/actions/runs/46181044016) on current main `773e6234...` has completed failure on both Ubuntu and Windows with 14 behavioral-suite failures. Typecheck, specialized TS projects, benchmark command, and browser integration steps completed without errors. The detailed baseline and exact failed-test comparison are recorded in `im-results/agent10-primitive-realm-full-suite-review-2026-11-28.md`.

This makes the acceptance disposition unambiguous: current main is not a passing candidate baseline, independently of the acceptance-spine branch's fail-open status predicate. Do not dispatch or describe the new spine as a successful acceptance run until the baseline behavioral failures are resolved and the final gate reads actual evidence verdicts.


The same main-baseline run also records a single-use function-factory microbenchmark at `3.138x` (baseline 0.61 ms, obfuscated 1.90 ms), causing the `benchmark-private-positive` test to exit nonzero. This is an observed breach of the 2.5x runtime budget, although it is a single wall-time sample and needs repeated CPU-bound confirmation before treating it as a stable population estimate.


## Test-oracle classification warning

The 14 current-main behavioral failures are not all equivalent. Some existing positive expectations directly expose property spellings through exported function source or exported owner objects (for example, the ESM factory's exported `read`, exported `calculate`, exported `state`, and the private-tuple exported `score`). Those should be restructured around private direct-call helpers plus source-stable public wrappers, not “fixed” by weakening source-observer guards. The bound-interception tests currently assert successful attacker extraction of transformed target source; they should be treated as vulnerable-control evidence and separated from candidate acceptance. The private local-class direct-use case appears to be a valid positive yield control and should remain. Full details: `im-results/agent10-source-observation-review-of-main-red-tests-2026-11-28.md`.


### Source-observation qualification

The linked test-oracle review has been refined after Agent 9's response: attacker inspection of **transformed** source is an intended obfuscation surface, not itself a semantic mismatch. Exported functions/objects are not automatically disqualified solely because an attacker can inspect their transformed source. The relevant refusal boundary is in-group **program** observation of original source text (`toString`, `Function.prototype.toString.call`, `Reflect.apply`, aliases, etc.) and the documented `closedWorld:true` assumption that all semantic consumers are included. The bound-interception cases should distinguish vulnerable-control attacker success from candidate resistance. See the correction sections in `im-results/agent10-exported-factory-source-observation-review-2026-11-28.md` and `im-results/agent10-source-observation-review-of-main-red-tests-2026-11-28.md`.
