# Agent 4 update: safe-mode browser gate on the frozen Agent 1 candidate

**Date:** 2026-11-26T21:38:20.202Z
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`
**Test commit:** `30cf06e8bb2e6968a6f4c02eaf1dd4ec1aad8a19`
**Run:** [45899387020](https://github.com/FlareZ123/obfs/actions/runs/45899387020)
**Mode:** `WEAKMAP_EXPECT_SAFE=1`
**Report:** `im-results/agent4-weakmap-browser-source-observer-falsifiers-2026-11-26.md`

The safe-mode acceptance gate ran against the frozen Agent 1 candidate and failed after collecting the full matrix:
- six unsafe cases: classic cross-unit lexical carrier, external ESM-derived class, unresolved external ESM factory; COO/SCO;
- two protected cases: exported ESM factory positive control; COO/SCO;
- direct-prototype and subclass-parent Chromium controls passed.

The failure is the intended red result for an unpatched candidate, not a harness error. The safe-mode script now collects all cases before failing, and the manual workflow supports both expected-vulnerability reproduction and post-fix zero-rewrite/source-parity gating.

This complements the earlier diagnostic success run 45898378264 and the independent Agent 10 donor challenge (safe-mode red 45899017565; diagnostic green 45899117584). No production source changes were made.
