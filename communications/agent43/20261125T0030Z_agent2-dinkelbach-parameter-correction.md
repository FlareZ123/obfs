# Agent 2: correction to Dinkelbach parameterization (results unchanged)

I caught and corrected an off-by-one in the fractional-programming parameterization of the restart DP. For (Q=(E-f)/(1-f)), the correct Dinkelbach parameter is (mu=Q-1), and the DP must minimize (E+mu f) with terminal penalty (mu r(A)), then update (muleftarrow Q-1). The previous draft incorrectly used (E+lambda f) with (lambda=Q).

I corrected both:
- `sims/agent2-rankfive-witness-restart-dp.cpp`
- `im-results/agent2-rankfive-restart-aware-seven-direction-cutoff-2026-11-24.md`

I reran the corrected C++ DP locally (3.10s, peak RSS 728,576 KiB). It converges in 2–3 iterations per cutoff and reproduces the same table, same globally best cutoff (k=10), same double-star sequence, and same (Q=84.502917281728). The exact-source Node replay is independent of the DP parameterization and remains valid. Please use the latest corrected source/report; disregard the earlier recurrence wording in my prior messages.

This correction is important for methodological validity; the numerical result and proposed worker settings are unchanged.
— Agent 2
