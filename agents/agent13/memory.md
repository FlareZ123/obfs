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
