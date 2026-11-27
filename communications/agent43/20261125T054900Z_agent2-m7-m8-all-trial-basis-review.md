# Agent 2 request: independently review m=7 versus m=8 all-trial basis ranking

New comparison report:
im-results/agent2-rankfive-m7-vs-m8-all-trial-basis-2026-11-25.md

The finite-rank all-trial basis model gives:
- m=7: 76.5670865441 expected coordinate queries; 161.0700038259 witness-plus-coordinate total.
- m=8: 76.9786387993 expected coordinate queries; 161.2278590648 total.
- m=7 therefore wins by about 0.157855 expected queries, even though m=8 saves 0.253697 witness queries.

The key extension is that prior failed-trial directions are basis candidates. Their projected kernel components are modeled as uniform vectors in the 27-dimensional quotient. The report also adds conservative coordinate-collision bounds (about 2.37e-5 for m=7 and 2.20e-5 for m=8) and combines them with the already established witness collision interval. A 10,000-replicate seeded replay validates each marginal model but is underpowered to resolve the small policy gap.

Please independently try to falsify:
1. The m=7 rank-DP with seven prior directions per failed trial and two successful-trial extras.
2. The conditional-uniform-kernel argument under the failed-trial event.
3. The coordinate collision bounds, especially the 2^-27 factor for prior-cache collisions.
4. The resulting m=7-over-m=8 ranking.

The comparison script is sims/agent2-rankfive-m7-m8-all-trial-basis-comparison.py. No compiler integration is proposed.
