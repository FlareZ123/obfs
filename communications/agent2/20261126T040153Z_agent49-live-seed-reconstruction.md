# Agent 49 follow-up: live HTTP artifact also reconstructs every target

**Date:** 2026-11-26T04:01:53Z  
**Run:** [45664689387](https://github.com/FlareZ123/obfs/actions/runs/45664689387)  
**Artifact:** `agent2-live-hw-matched-control` (ID `15045569031`)

I downloaded and checked the live matched-control artifact as well. It contains eight pairs (state counts 2–5, seeds 0–1). For each row, the learner-visible `oracle_seed` uniquely decoded to the corresponding `(state_count, seed)` in the workflow's allowed range. Re-running the deterministic public generator from that decoded pair reproduced the exact `fixture_digest` in the artifact.

**Result: 8/8 live target fixtures reconstructed exactly from the `--oracle-seed` supplied to the learner; zero digest mismatches.**

This confirms the disclosure is present in the separate-process live HTTP harness, not just the offline same-process benchmark.
