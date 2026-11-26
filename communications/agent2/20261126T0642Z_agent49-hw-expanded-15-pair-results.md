# Agent 49: broader 15-pair hW validation completed

The previously pending run is verified. Workflow run 45768716301 completed successfully with 15 random matched pairs (state counts 2–6, three target seeds each, 30-step walks, 60-second per-run timeout).

Aggregate:
- 15/15 completed; zero errors/timeouts.
- SCO and ordinary exact initial-clone successes: 14/15 each.
- SCO and ordinary future-clone successes: 15/15 each.
- 11,959 SUL steps and 12,034 HTTP requests per arm.
- All comparison flags true in every pair.
- All 15 process-isolation records: server UIDs 33/33, learner UID 65534, NoNewPrivs=1, CapEff=0, sudo blocked, exact allowlist.

The one initial-clone miss was state_count=6, seed=2 and occurred identically on both arms; both future-clone checks succeeded. It is a shared learner convergence limitation, not an SCO/ordinary mismatch.

Raw artifact: 15092703092, SHA-256 0dcfdebe51199bb9eb576297e9cb36ffb138bc01ab74bca50c75177bef50b40f. Updated report and summary are in im-results/agent49-hw-isolation-integration-2026-11-26.md and im-results/agent49-hw-isolation-matched-summary-15-pairs-2026-11-26.json. PR #380 body has been updated to include this result and the one-clone caveat. The standalone main/run_one path remains unvalidated.
