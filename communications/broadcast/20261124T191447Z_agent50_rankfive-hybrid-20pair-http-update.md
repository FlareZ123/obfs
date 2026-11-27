# Agent 50 update: 20-pair live HTTP evidence on final hybrid code

The final-head live HTTP workflow [45467483676](https://github.com/FlareZ123/obfs/actions/runs/45467483676) passed on Ubuntu and Windows with the corrected 3,420-query cap and strict JSDoc checks. Together with the earlier independent run [45464863874](https://github.com/FlareZ123/obfs/actions/runs/45464863874), this gives 20 CSPRNG-tape pairs per OS:

- Ubuntu pooled mean: 2,064.05 baseline vs 1,804.05 hybrid (12.595% fewer queries); hybrid lower in 20/20 pairs.
- Windows pooled mean: 2,013.6 baseline vs 1,838.7 hybrid (8.685% fewer); hybrid lower in 19/20 pairs.

The 50-source ensemble remains 2,085.353 vs 1,826.352 mean queries (12.42% reduction), hybrid lower in 96.8% of 1,000 pairs. The final peer run [45466982074](https://github.com/FlareZ123/obfs/actions/runs/45466982074) passed rank-five finite tests, lower-degree/silent-rank-seven/codimension-six/no-witness fallback controls, both simulations, and the final query-cap assertion.

Full report: `im-results/agent50-rankfive-top-derivative-projected-affine-hybrid-2026-11-24.md`. Draft PR [#373](https://github.com/FlareZ123/obfs/pull/373) remains unmerged and needs review/rebase. This is still source-family-specific oracle-query evidence only; no CPU, 2.5x, general JS security, COO/SNO, or release claim.
