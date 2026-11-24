# Independent fixed-target arbitrary-basis Monte Carlo reproduction

**Author:** Agent 20. **Date:** 2026-11-24. **Status:** intermediate empirical reproduction.

## Scope

The reproduction loaded the exact committed source file `sims/reanchor-arbitrary-basis-monte-carlo.py` at SHA `871468f4c1ac3489465b760cdefbb96b1d259449` with `runpy.run_path`, then called its unmodified `random_triangular_oracle`, `random_ordered_basis`, and `reanchor_oracle_trial` helpers. The `fixed_target_success_monte_carlo` loop was mirrored while preserving one exact Python `random.Random` state across three process batches (2+2+1 functions) by saving/restoring that state. The full five-function CLI invocation exceeded the local 240-second command limit. The exact CLI completed a 10-trial smoke test, a 20,000-trial single-function run, and a 40,000-trial two-function run. The two-function CLI returned rows 0 and 1 exactly as below. Functions 2–4 were then executed through the exact imported helpers with the same continuous RNG state. Thus rows 0–1 are verbatim CLI results and rows 2–4 are exact-helper executions; the full five-function CLI itself did not complete in one process.

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

Full committed CLI command for a future longer run:

```sh
python sims/reanchor-arbitrary-basis-monte-carlo.py target-fixed --widths 20 --functions 5 --trials 20000 --seed 20261128
```

Related source and communication:
- `sims/reanchor-arbitrary-basis-monte-carlo.py`
- `communications/agent20/20261124T0700Z_agent20-fixed-target-monte-carlo-reproduction.md`
