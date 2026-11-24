# Independent fixed-target arbitrary-basis Monte Carlo reproduction

**Author:** Agent 20. **Date:** 2026-11-24. **Status:** intermediate empirical reproduction.

## Scope

This independently reproduces the fixed-target experiment in `sims/reanchor-arbitrary-basis-monte-carlo.py` using a local port of its core helpers: `random_triangular_oracle`, `random_ordered_basis`, `reanchor_oracle_trial`, and `fixed_target_success_monte_carlo`. The five-function RNG stream was preserved across three process batches (2+2+1 functions) by saving/restoring the exact Python `random.Random` state. This is not a verbatim execution of the full committed CLI file; the full CLI attempt did not complete within the available local command window. Treat this as independent reproduction of the fixed-target loop, not a replacement for an end-to-end run of the committed script.

Configuration:
- width: 20
- functions: 5
- trials per function: 20,000
- seed argument: 20,261,128
- RNG seed: `20261128 + 20*7000 = 20401128`
- each sampled function is a uniformly sampled compatible triangular permutation, with one target input fixed for all trials on that function
- each trial samples a uniform ordered basis in GL(20,2) by sequentially drawing vectors outside the previous span, and a uniform anchor

## Results

| Function | Fixed target input | Target output | Successful target inversions | Compatible bases |
|---:|---:|---:|---:|---:|
| 0 | 65,602 | 815,685 | 0 / 20,000 | 0 |
| 1 | 531,762 | 397,217 | 1 / 20,000 | 0 |
| 2 | 723,972 | 299,924 | 0 / 20,000 | 0 |
| 3 | 235,661 | 167,862 | 2 / 20,000 | 0 |
| 4 | 796,055 | 535,628 | 0 / 20,000 | 0 |
| **Total** | — | — | **3 / 100,000** | **0 / 100,000** |

The success vector is `[0,1,0,2,0]`, exactly matching Agent 2's reported fixed-target result. All three successful trials had full-rank but incompatible normalized secant matrices: the helper returns `(False, False)` for singular matrices, and `compatible=False` for every full-rank trial in this sample.

## Interpretation

These are target-specific fixed-point convergences outside the lower-unitriangular compatibility premise. They do not establish a reusable compatible basis, a uniform convergence bound, or a source-independent probability. The 0/100,000 compatible count is an empirical observation for five sampled functions and this seed, not a proof that compatible bases do not exist. The exact final oracle equality check remains necessary.

The experiment is distinct from the arbitrary-basis exhaustive width-three/four peer check in `im-results/agent20-arbitrary-basis-peer-check-2026-11-24.md`: the latter counts all bases for two fixed small sources, while this Monte Carlo samples random triangular functions at width 20.

Related source and communication:
- `sims/reanchor-arbitrary-basis-monte-carlo.py`
- `communications/agent20/20261124T0700Z_agent20-fixed-target-monte-carlo-reproduction.md`
