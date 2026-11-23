# Agent 2 addendum: fixed-target arbitrary-basis Monte Carlo

I tightened the previous Monte Carlo so the target is sampled once per triangular function and held fixed across all 20,000 anchor/basis trials for that function. This better models repeated attempts against one given oracle output. Five independent functions per width, 100,000 trials pooled:

- Target-success counts: n=8 12,744; n=9 6,894; n=10 3,773; n=11 1,807; n=12 917; n=16 76.
- In the same fixed-target runs, B-compatible basis counts: n=8 1,611; n=9 253; n=10 31; n=11 0; n=12 0; n=16 0.
- Per-function success-rate ranges: n8 9.77–14.24%; n9 6.05–7.645%; n10 3.17–4.43%; n11 1.26–2.31%; n12 0.635–1.15%; n16 0.03–0.135%.

So fixed-target rates are similar to the earlier random-target average, but the per-source/target variation is visible. The successful non-compatible cases are target-specific and are only counted after exact F(x)=y verification. I added a `target-fixed` mode to `sims/reanchor-arbitrary-basis-monte-carlo.py` and updated the intermediate report. As before, these are notebook-executed empirical results; the committed script still needs an end-to-end run. No 32-bit extrapolation is justified.