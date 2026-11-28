# PR #384 frozen-source adversarial acceptance packet — 28 November 2026

**Author:** Agent 3. **Disposition:** **RELEASE-BLOCKED**. Evidence is a finite, source-pinned rejection of the primary strong-obfuscation claim, not a universal impossibility result. This record distinguishes actually completed gates, a missing external dependency, and pending compatibility tests.

## Frozen source and review boundaries

- Actual PR [#384](https://github.com/FlareZ123/obfs/pull/384) head when selected: `a8a22f9aef6e7f0d487cebc23c87063376df55cb`. Its PR body described an older head `5cbb5e2a20c475f9f9915b6e4c1d9c0e675c5a7f`; its body is not an actual-head receipt.
- Exact unmodified source branch: `agent3/pr384-a8a22-frozen-full-gate-20261128`, pinned at `a8a22f9`. No tests, compiler, or workflow changed on this branch.
- Reviewer branch `agent3/pr384-a8a22-core-minified-isolate-20261128` at `e6f619b1fc5307f7b671def88cc8e5d98e35a3e6` differs from the above frozen source **only** in `.github/workflows/manual-minified-control.yml` (+10 changed lines) to expose a manually selected `skip_external_attacker` option. The original binary/JS compilation, test fixtures and lockfile remain byte-identical. The external JSIMPLIFIER adversary is explicitly **unmeasured** in that run.

## Completed exact-source three-mode adversarial comparison

Full [cross-mode release-evidence run 46111092145](https://github.com/FlareZ123/obfs/actions/runs/46111092145): SUCCESS on Ubuntu Linux and Windows, Node `v22.23.4`; original run explicitly reported `summary.verdict=RELEASE-BLOCKED`.

| Tested mode | Independently observed failure of a protection objective | Unmeasured boundary |
| --- | --- | --- |
| COO | 3/3 selected functions recovered from distributed source; reconstructed executable application retained heldout functional parity; offline use succeeded | General source extraction from arbitrary programs; arbitrary tamper resistance |
| SNO | 3/3 selected arithmetic functions reconstructed, 12,288 heldout evaluations; attacker forged public digest manifest and substituted the owner-controlled ESM loader; offline functional clone | Arbitrary hostile-runtime integrity mechanism |
| SCO | A legitimately credentialed client replayed the selected remote service from an online facade and reproduced its outputs | Unauthorized credential bypass or private source extraction; no claim that those occurred |

Performance evidence of **strict compute-boundary** violation (sampled paired observations, not mean or median alone):

- Linux: `computeBoundaryFamilywise.verdict=sample-exceeded`; **39** strict pairs above 2.5×, observed maximum `31.66509468185446`×.
- Windows: `computeBoundaryFamilywise.verdict=sample-exceeded`; **35** strict pairs above 2.5×, observed maximum `22.43548387096774`×.
- The SNO resident selected-hot-path CPU budget and SCO thin-call sampled performance exceeded budget; the selected COO sampled populations were separately supported. SNO initialization was explicitly excluded for the resident CPU comparisons. These are workload-specific results, not a universal bound.
- Both OS runs preserve raw output pairs and workload measurements as uploaded workflow artifacts (`release-evidence-Linux` and `release-evidence-Windows`).

This workflow's SUCCESS means the attack/evidence harness correctly demonstrated and recorded those limits. It does **not** mean the target passed protection/release requirements.

## Equal-trust ordinary minifier control and external-adversary isolation

- Original unmodified four-way workflow [46111088965](https://github.com/FlareZ123/obfs/actions/runs/46111088965) FAILED on both operating systems **before the comparison**, because external JSIMPLIFIER pinned dependency `gemini-js@1.0.2` returned HTTP 404 at `https://registry.npmjs.org/gemini-js/-/gemini-js-1.0.2.tgz`. This failure is environment/dependency, not a candidate or attacker outcome.
- An isolated workflow-only derivative [46111330627](https://github.com/FlareZ123/obfs/actions/runs/46111330627) completed SUCCESS on both OS; Linux also ran native real Chromium with source-identical compiled module graph. The JSIMPLIFIER steps were skipped **by explicit input**, so they remain unmeasured.
- Compared the same three-module ESM application: original `2,467` bytes; esbuild 0.28.2 unbundled minified `1,115` bytes; published COO `7,498` bytes; source-only reconstructed graph `2,342` bytes. Hashes of all four artifacts matched the frozen comparisons across both operating systems and real Chromium.
- Independent static attacks recovered **3/3** selected arithmetic functions from each of minified and published COO outputs, with 12,288 heldout output comparisons. Matching **three public queries** recovered equivalent integer translations from native, minified, published and reconstructed versions. The tested candidate has **no demonstrated recovery resistance advantage** over ordinary minification on this application.
- Linux Node four-population strict count: **1** measured paired ratio above 2.5×; Windows Node: **0**. The six-population Linux Node/Chromium aggregate recorded **2** strict breaches and maximum `2.83809523809524`× despite statistically supported median ratio bounds. Chromedriver reported `Chrome/158.0.8127.36`, verified callbacks and output, and 288 fresh module requests.
- Verdict of the comparison module: `matchedStaticDecision.attackAdvantage=contradicted` on Linux and Windows. This is a **bounded attack advantage falsifier**, not a measurement of human analyst hours, nor a claim about every possible code structure.

## Pending and missing axes

- Complete frozen PR #384 [manual-validation run 46111052891](https://github.com/FlareZ123/obfs/actions/runs/46111052891): **COMPLETED FAILURE on both Ubuntu and Windows** at the same exact a8a22f9 head. Node TAP: Ubuntu **5,741 passed / 7 failed / 25 skipped** (total 5,773); Windows **5,731 passed / 7 failed / 35 skipped**. The failure set is precisely the same seven positive obfuscation-yield assertions, not seven demonstrated behavioral mismatches. All were expected protected-field/binding renames absent in conservative source-observer island cases. Failed case IDs `5033,5035,5036,5038,5040,5046,5047`; source files `test/source-observer-islands-fuzz.test.js`, `source-observer-islands-host-argument.test.js`, `source-observer-islands-reflection-gate.test.js`, `source-observer-islands.test.js`. Complete `FAILED_TEST_INDEX` is retained in both job logs. All remaining JSDoc/typechecks, benchmarks, resident profiles and the three Ubuntu real Chromium gates that executed were successful. The isolated exhaustive oracle and blind-affine audit steps were skipped after the failure; Windows Chromium is intentionally Linux-only. This is a **reproducible protection-yield failure**: semantic compatibility success does not justify asserting transformation coverage.
- Current PR candidate has separate reported 8/10 red cross-file function-source host-flow witness from Agent25 (test-only CI run `46099476550`), as well as historical CFG/source-observer concerns. These are **not** proven closed by the cross-mode security workflow above.
- A general source-based anti-LLM/agent attack-cost trial with a trusted preregistered method, matched effort and audited server logs remains **unmeasured**.
- Only a finite selection of source/host effects and workloads were exercised; no result establishes protection in COO/SNO against an attacker with complete runtime control, or universal 2.5× runtime compliance.

## Replication

All original snapshots and complete run logs are retained in public GitHub Actions; review exact `head_sha` rather than moving branch labels. Source drivers: `sims/release-evidence-gate.js`, `sims/polyvariant-app-four-way-control.js`, `test/polyvariant-app-four-way-browser.js`, `sims/four-way-cross-runtime-verdict.js`, `sims/candidate-vs-minified-decision.js`. Workflows: `.github/workflows/manual-release-evidence.yml`, `.github/workflows/manual-minified-control.yml`, `.github/workflows/manual-validation.yml`.

**Decision:** The primary strong-protection claim is rejected for this source-pinned finite evidence packet, independent of the eventual full compatibility gate. Keep PR #384 draft/release-blocked; preserve separately labeled `semantic parity`, `correct refusal`, `missing protection yield`, `semantic mismatch`, `environment/fixture failure`, and `performance breach` classifications. No source branch is automatically approved for merge.
