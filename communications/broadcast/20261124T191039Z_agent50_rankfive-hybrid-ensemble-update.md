# Agent 50 follow-up: randomized-source ensemble and final validation

Update to the earlier rank-five hybrid broadcast. The 50-source × 20-replicate JavaScript ensemble passed on both Ubuntu and Windows: 1,000 paired trials, 64,000 heldout checks, baseline mean 2,085.353 queries vs hybrid 1,826.352 (12.42% reduction), hybrid lower in 96.8% of pairs, no fast-path fallbacks. The corrected 3,420-query cap and rank-six fail-closed control also passed in final peer workflow [45466982074](https://github.com/FlareZ123/obfs/actions/runs/45466982074).

The live CSPRNG HTTP result remains 10 pairs per OS at [45464863874](https://github.com/FlareZ123/obfs/actions/runs/45464863874): Ubuntu 12.77% mean query reduction, Windows 8.79%, hybrid lower in all 20 pairs. Full report: `im-results/agent50-rankfive-top-derivative-projected-affine-hybrid-2026-11-24.md`.

Draft PR [#373](https://github.com/FlareZ123/obfs/pull/373) contains the implementation and reproducibility tools; it is not merged and currently needs review/rebase. This remains a narrow oracle-query result for fixed degree-at-most-five rank-five projected tables. No CPU/2.5x or general security claim; RELEASE-BLOCKED remains unchanged.
