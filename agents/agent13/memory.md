# Agent 13 durable memory

## Claimed incarnation
- Lease: agents/agent13/.lease.json, run_id agent13-20261115-safe-obfuscation, claimed 2026-11-15T09:47:02Z. Follow mandatory 70-minute lease release only at or after 10:57:02Z by actual runtime clock. Do not refresh lease.
- Mode draw: actual Python secrets RNG selected 2 (normal research mode).
- Read root README and selected Critic broadcasts at 08:30 and 09:20. The no-on-commit-workflows rule is binding. Mainline SCO/COO/SNO already implements substantial conservative transforms, but static/LLM/runtime reconstruction resistance remains unproved.

## Work performed
Built a public-source external LLM-deobfuscation evaluation bridge for the 2025 ACM CCS JsDeObsBench dataset. Upstream repository Ch3nYe/JsDeObsBench, commit 8b2e1c35dc4ae25a46ea580ea5dcb6b5de5edbe9, name-obfuscation corpus blob 4bde98f958eb81b070f411f39545ea6d5339e8d8. Directly audited published 1,301 CodeNet original/test-case programs: 1,211 contain Linux /dev/stdin, 1,249 contain direct require, 168 contain non-ASCII; original length p50 512 / p95 947 / max 999 UTF-16 units; per-program tests median 2, max 6. These are syntactic counts.

Files:
- sims/jsdeobsbench-adapter.js and test/jsdeobsbench-adapter.test.js: deterministic per-row SHA-derived seed, preserve original/test_cases, emit COO/SNO code and transform metrics. No code execution during conversion. SCO requires a separate online oracle experiment.
- sims/jsdeobsbench-audit.js and test/jsdeobsbench-audit.test.js: nonexecuting counts and quantiles.
- sims/jsdeobsbench-differential.js and test/jsdeobsbench-differential.test.js: deterministic source/hash-pinned native vs obfuscated stdin/stdout differential evaluation. Each third-party program runs only inside manually dispatched restricted Docker. Original failures are counted as baseline-ineligible; do not misclassify them as compiler defects. A Linux /dev/stdin source cannot re-open a Node spawnSync pipe (ENXIO); attach a regular read-only FD backed by atomicWrite in a per-run private tmpfs directory instead. Docker uses network none/read-only/rootless/CPU/pids/memory limits with a 32-MB tmpfs.
- sims/jsdeobsbench-coverage.js and test/jsdeobsbench-coverage.test.js: size and compiler-transform coverage summary distinct from attack-resistance.
- im-results/jsdeobsbench-adapter-2026-11-15.md: protocol and upstream pin/limitations.
- .github/workflows/manual-jsdeobsbench.yml: intentionally manual-only; pinned upstream Git hash check, mode matrix, sandboxed evaluator, originally sample 50 of first 100, since changed to all 1,301 programs and sample 0 to provide full coverage.

## Verified CI checkpoints
- Manual full Linux/Windows validation run 43701928841 at commit 46e1b9e: success; validated original adapter tests and previous suite.
- Manual external run 43702918423 at commit 18b48aa: misleading apparent success (89/94 baseline failures); diagnosed ENXIO from CodeNet /dev/stdin reopen via Node pipe. Keep failure evidence.
- Follow-up run 43703061283 at b646e89 reproduced error directly in logs; confirms diagnosis.
- Manual external SCO-excluded COO/SNO run 43703293828 at commit d030572: success, exact 94/94 native eligible cases and exact 94/94 transformed matches in each mode over 50 sample programs. Whole-process median ratios COO 0.9970923512x; SNO 1.0007139722x, includes spawn and V8 startup and not hot-path budget. Both source visible to owner/attacker; no anti-LLM score claimed.
- Manual full Linux/Windows validation run 43703443619 on commit 20eeb56 was successful, covering 3 new differential, source audit and stdin tests but not later coverage script.
- Manual full 1,301-program external run 43703432496 on commit 20eeb56 was in_progress at ~10:20 UTC. Inspect conclusion, logs and actual full counts. It may have baseline exclusions or transform mismatches; do not infer results without logs.

## Next actions
1. Check current full-corpus Docker run 43703432496, diagnose any discrepancies, publish exact per-mode counts and timings with pinned SHA. If failures, preserve witnesses and fix soundness only with paired positive tests.
2. Include explicit transform-coverage report in manual workflow, then collect numbers and note 2.5x hot-path budget cannot be proven from process-wall ratios.
3. Update im-results report with real measurements, and communicate to other agents once validated.
4. Run one meaningful manual Linux/Windows release validation after covering new code; avoid dispatch per microscopic change. Do not add per-commit triggers.
5. No LLM model API access was connected; independent LLM/agent deobfuscation scores remain future work. A temporary Workers_API call returned 404, so direct peer-agent question was unavailable.
6. Watch for concurrent mainline changes, commit through GitHub connector with Agent 13 prefix, and verify updates.

## Threat-model takeaway
Conservative AST is a correctness-oriented baseline; a public corpus cannot establish strong confidentiality for COO or SNO with complete owner source/runtime. SCO can retain server-only methods under real authorization, but online black-box oracle attacks and latency remain limiting. We have built an evidence harness rather than claiming an architecture breakthrough.

## Second checkpoint (2026-11-15 10:47 UTC)

- Full external run [43703432496](https://github.com/FlareZ123/obfs/actions/runs/43703432496) passed COO and SNO (script) on all 1,301 CodeNet sources, 2,200 official cases attempted per mode, 2,199 native eligible and **2,199 / 2,199** exact transformed matches, one original baseline ReferenceError on p02618_1 input.
- Full script coverage run [43703960540](https://github.com/FlareZ123/obfs/actions/runs/43703960540) measured original 719,005 UTF-8 bytes; COO 824,951 bytes (1.147351x), SNO script 1,319,459 bytes (1.835118x). COO binding renames 2,929 across 830/1,301; SNO adds 2,304 string literal encodings in 1,039 programs. Neither script grammar renames private property keys (intentional code guard). Cold whole-process ratios p95 under 1.11x and max under 1.34x, no >2.5 among paired cases; this is not hot-path proof.
- Added explicit --source-type script|commonjs option, preserving historical default script; updated differential evaluator to execute CommonJS original and transformed actual .cjs Node file modules. Three-lane run [43704598450](https://github.com/FlareZ123/obfs/actions/runs/43704598450) passed 2,199 / 2,199 eligible in COO script, SNO script and SNO CommonJS. SNO CommonJS renames 3,118 identifiers across 842 programs and encodes 2,304 string literals. Private property renames still zero in this particular corpus. Synthetic CJS property fixture proves pass exists; raw CodeNet approximate lexical scan found only 9 const object literal definitions and 3 owner direct-dot examples, so this is weak coverage for property proof. See im-results/jsdeobsbench-adapter-2026-11-15.md for detail.
- Added jsconfig.external.json and npm run typecheck:external, integrated strict JSDoc check into manual-validation.yml. Five initial TS errors found in run 43704838013 were fixed by precise JSDoc for metric keys, ErrnoException, sample keys, DifferentialReport. Full Node 22 Ubuntu/Windows [43705029000](https://github.com/FlareZ123/obfs/actions/runs/43705029000) passed all tests + both JSDoc checks + benchmarks + Chromium.
- Added --min-baseline-rate default 0.95 to the external CLI so a replay with too many baseline-ineligible official cases does NOT produce green. Added optional --require-transform in coverage CLI and manual workflow, with cross-platform regression testing of all-no-op transformed output. Full three-lane external run [43705303086](https://github.com/FlareZ123/obfs/actions/runs/43705303086) passed the updated gates.
- Updated README.md with external test protocol and clear caveats. Interagent broadcast communications/broadcast/2026-11-15T1025Z_agent13_jsdeobsbench-full-compat.md requests independent pinned model or normalizer adversarial attempts. Agent 25 wrote communications/agent13/2026-11-15T1039Z_agent25_external-typecheck-gate.md about the five errors; replied via communications/agent25/2026-11-15T1043Z_agent13_external-typecheck-resolved.md confirming the repaired green gate.
- Concurrent owners Agent 9 and Agent 25 are modifying src/sco.js authorization and asset disclosure protections. A later manual full run 43705289917 pinned source c227254 failed only on 3 src/sco.js JSDoc unknown narrowing issues; Agent 9 repaired them in commit 317ccc020f. Latest full manual CI was dispatched at about 10:47 UTC after these fixes. Do not conflate that earlier red with external corpus tools.
- Only external compatibility and observed transform coverage established. User's overarching strong general-purpose secrecy, tamper-resistance, domain-lock, and universal 2.5x hot-path claims remain **unproved**. Keep report honest and provide a concrete next research path: pinned public-code reconstruction model / LLM evaluation, full multi-file graph property tests under execution, and time/cost of SCO private oracle cloning.

### Release note
At end of this incarnation perform the prompt's required lease check at actual clock; **70 minutes from original claim 09:47:02Z is 10:57:02Z**. If and only if reached at checkpoint, commit useful work, ensure pushes, then remove agents/agent13/.lease.json as final repository mutation, push, verify, and exit. Do not refresh lease. If below threshold, continue useful research.

## Third checkpoint (2026-11-15 10:55 UTC)

- Added verification that each generated obfuscated source matches its obfs_output_sha256 field before any code execution. Extended differential regression for both an accidental changed source with stale hash (rejected) and an intentionally re-hashed but semantically incorrect source (counted mismatch). Full Windows/Linux [43705836027](https://github.com/FlareZ123/obfs/actions/runs/43705836027) at commit 19e1a14 passed.
- Crucial negative evidence: external all-lane [43705839659](https://github.com/FlareZ123/obfs/actions/runs/43705839659) saw one COO script mismatch in p02385_1 case 0: original No, output Yes, plus original disagreeing with official expected. Direct pinned source inspection showed Math.random() inside 100-iteration dice search. Separate subprocesses had independent unseeded V8 PRNG streams, so this is an environmental nondeterminism confounder, not established compiler bug. Do not erase the failure.
- Repaired sims/jsdeobsbench-differential.js: derive positive 31-bit SHA256 seed per filename/testcase and pass identical Node V8 --random-seed flag to both original and obfuscated subprocesses; avoids monkeypatching Math.random function identity. Synthetic test checks fixed-seed repeatability/differentiation. Commits 1cb2f1d, 13bf696. Research report appended exact failure witness, mechanism and limits, commit 1c12333. Other entropy/time/concurrency sources remain unaddressed.
- Final full test CI run 43706323035 and three-lane external run 43706326751 were both in progress at ~10:55 UTC, pinned commit b7faf8b254 (other agents contributed concurrently). Check statuses and failures, record results. If pass, update memory with exact SHA and release at measured 70 minutes.
- At any point, the prompt's sole self-initiated normal-agent exit condition remains measured lease age >=70 minutes, with lease deletion final repository operation after all useful commits pushed. Deadline 2026-11-15T10:57:02Z.
