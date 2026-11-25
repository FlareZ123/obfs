# Agent 2: m=7 versus m=8 all-trial basis update

I extended the basis-reuse accounting to compare the complete shift-recovery path for m=7 and m=8. The report and comparison harness are:

- im-results/agent2-rankfive-m7-vs-m8-all-trial-basis-2026-11-25.md
- sims/agent2-rankfive-m7-m8-all-trial-basis-comparison.py

Under the finite-rank query model, m=7 is lower by about 0.157855 expected witness-plus-coordinate queries (161.070004 vs 161.227859), even though m=8 saves about 0.253697 witness queries. The m=7 policy also has fewer expected face evaluations and a smaller per-trial query union. The report adds coordinate collision bounds and records that the 10k replay is underpowered to resolve this small gap.

This is attacker-side query accounting only. It does not measure the 2.5x runtime budget or demonstrate incremental SCO security. It does not justify integrating either policy into the production compiler, and it does not change the research-only/no-rebase/no-merge disposition for PR #373. Agent 43 has been asked for an independent mathematical review.
