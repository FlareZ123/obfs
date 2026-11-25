# Full-path m=7 versus m=8 query comparison with all-trial basis reuse

**Status:** intermediate attacker-side result for the frozen rank-five SCO oracle family. This compares query policies only; it is not a compiler or runtime result.

## Finding

The successful-trial-only comparison favored m=8 by about 0.654 expected witness-plus-coordinate queries. That comparison did not include all directions observed in prior failed trials as input-basis candidates.

After adding those prior directions and accounting for their finite rank in the 27-dimensional quotient left by the five successful anchors, the ranking reverses:

| Quantity | m=7, ten-face policy | m=8, fourteen-face policy |
|---|---:|---:|
| Expected witness queries | 84.5029172817 | 84.2492202655 |
| Expected coordinate queries, all-trial basis | 76.5670865441 | 76.9786387993 |
| Expected witness + coordinate queries | **161.0700038259** | **161.2278590648** |
| Per-trial miss probability | 0.2692495883 | 0.1796246218 |
| Expected failed trials before success | 0.3684562936 | 0.218954... |
| Faces tested per trial | 10 | 14 |
| Query-union size per full trial | 93 | 123 |
| Expected face evaluations | 6.572655... | 6.825422... |
| Expected direction words | 9.579194... | 9.751633... |

The m=8 witness stage saves **0.2536970162** expected queries. However, the m=7 all-trial basis saves **0.4115522552** expected coordinate queries relative to m=8. The resulting full-path advantage is **0.1578552390 expected distinct queries in favor of m=7**, before verifier samples.

This is a small query-count difference, but it changes the correct candidate ranking under the stated model. The m=7 sequence is already globally optimal over all ordered complete-face sequences for each fixed cutoff and cutoff 10 is optimal among the 21 cutoffs. The m=8 face-set search remains heuristic. The m=7 policy also uses fewer expected face evaluations and direction words, and has a smaller per-trial query union.

## Exact coordinate accounting

For each policy, the five directions in the successful face are the anchors. Quotienting the 32-bit input space by their span leaves dimension 27. If there were \(k\) failed trials before success, the prior-trial directions project to \(7k\) uniform vectors for m=7 or \(8k\) for m=8 in this quotient.

The exact rank recurrence is documented in:

- im-results/agent2-rankfive-all-trial-basis-expectation-2026-11-25.md
- sims/agent2-rankfive-all-trial-basis-expectation.py

The m=7 calculation uses the same recurrence with seven prior directions per failed trial and two non-anchor directions from the successful trial. Its first-success face weights are derived from the exact 2,667-kernel enumeration. The conditional expected coordinate costs for m=7 are:

| Failed trials \(k\) | Expected coordinate queries |
|---:|---:|
| 0 | 79.1158901078 |
| 1 | 72.1158941264 |
| 2 | 65.1164084513 |
| 3 | 58.1814838381 |
| 4 | 54.1854476416 |
| 5 | 54.0015563122 |
| 6 | 54.0000121657 |

The m=7 expected coordinate count is 76.5670865441; the m=8 count is 76.9786387993. Both use the finite-rank basis DP, the exact successful-face distribution, and the geometric distribution of failed trials.

## Collision corrections and robustness of the ranking

The exact coordinate calculation retains the existing per-trial injective-subset-sum cache model and excludes accidental cross-trial query collisions. A conservative bound was added for the coordinate stage.

For a policy with \(m\) directions and per-trial miss probability \(f_m\), the probability that the \(m\) uniform 32-bit direction words within one trial are linearly dependent is

\[
p_{\mathrm{dep}}(m)=1-\prod_{j=0}^{m-1}(1-2^{j-32}).
\]

There are at most 81 coordinate probes. A union bound for within-trial mask collisions is therefore \(81p_{\mathrm{dep}}(m)/(1-f_m)\). A second union bound for a coordinate probe colliding with any nonzero point in a prior failed-trial query cache is

\[
\frac{81(C_{\max}-1)}{2^{27}}\frac{f_m}{1-f_m},
\]

where \(C_{\max}\) is the full-trial query-union size (93 for m=7 and 123 for m=8). The denominator \(2^{27}\) uses the uniform kernel component conditional on the five-bit projections.

| Policy | Within-trial bound | Cross-trial bound | Total coordinate correction bound |
|---|---:|---:|---:|
| m=7 | 0.00000327763 | 0.00002045733 | 0.00002373496 |
| m=8 | 0.00000586209 | 0.00001612086 | 0.00002198295 |

These are upper bounds on the expected query savings from collisions; actual coordinate costs can only be lower than the injective-mask model. The previously established collision-corrected witness-query gap satisfies

\[
0.2536614562
< Q_{7,\mathrm{witness}}-Q_{8,\mathrm{witness}}
<0.2537355151.
\]

Combining that interval with the coordinate bounds gives

\[
0.1577947571
< Q_{8,\mathrm{full}}-Q_{7,\mathrm{full}}
<0.1579145339.
\]

Thus the m=7 full-path advantage remains positive under these conservative corrections. This bound assumes that, conditional on the five-bit projections, the relevant kernel components are uniform; it should be independently reviewed.

## Randomized replay

A 10,000-replicate Python reproduction used the same OS-generated 256-bit master seed for both policies, with separate domain-separated counter streams. Each mode used 64 independent holdouts per replicate: **640,000 holdouts per mode**, all passing.

Master seed:

~~~text
b89a5ffa2ed9f00fd81efc3de0e06a5caa630fba2ab37b6001eac0c6f1986b29
~~~

| Policy / basis | Mean witness queries | Mean coordinate queries | Mean total queries | Median | P90 | P95 | Maximum |
|---|---:|---:|---:|---:|---:|---:|---:|
| m=7 standard | 85.4443 | 96.0000 | 181.4443 | 152 | 266 | 328 | 772 |
| m=7 anchors | 85.4443 | 81.0000 | 166.4443 | 137 | 251 | 313 | 757 |
| m=7 all-trial | 85.4443 | 76.4930 | 161.9373 | 134 | 240 | 297 | 730 |
| m=8 standard | 84.5316 | 96.0000 | 180.5316 | 152 | 274 | 310 | 738 |
| m=8 anchors | 84.5316 | 81.0000 | 165.5316 | 137 | 259 | 295 | 723 |
| m=8 all-trial | 84.5316 | 76.9630 | 161.4946 | 134 | 248 | 282 | 696 |

For m=7 all-trial, sample standard errors were 0.6890 witness, 0.0518 coordinate, and 0.6376 total queries. For m=8 all-trial they were 0.6822, 0.0449, and 0.6378. The observed failure rates were 27.63% for m=7 (exact 26.92496%) and 18.06% for m=8 (exact 17.96246%).

The randomized total means differ by 0.4427 queries in the opposite direction, but the standard error of that difference is about 0.902. This 10,000-replicate sample is therefore underpowered to resolve the predicted 0.1579-query gap. The replay validates each policy's marginal query accounting within sampling error; it does not empirically establish which policy wins by that small margin.

## Decision and next work

For the stated oracle-query objective, **retain m=7 as the preferred candidate** and do not spend integration effort promoting m=8. The full-path exact model and conservative correction bounds favor m=7; the randomized sample is consistent but not powered to resolve the difference.

Next, implement the all-trial basis extension in the m=7 attacker-side research learner only, then compare its measured CPU/wall time and memory against the anchor-only learner and an equal-trust conventional/minified control. This experiment does not measure the obfuscated program's 2.5× runtime budget, and it establishes no incremental SCO security advantage. Do not integrate this into the production compiler or treat it as a release-gate improvement.

## Reproduction

Run the exact m=7/m=8 comparison and paired randomized replays:

~~~sh
python3 sims/agent2-rankfive-m7-m8-all-trial-basis-comparison.py \
  --replicates 10000 \
  --seed b89a5ffa2ed9f00fd81efc3de0e06a5caa630fba2ab37b6001eac0c6f1986b29
~~~

The script reuses the existing exact face enumerator and m=8 replay harness. It reports the finite-rank m=7/m=8 expectations and the paired randomized samples.

## Review requested

**Agent 43:** independently review the m=7 rank-DP extension and, especially, the conditional-uniform-kernel argument and the 2^-27 cross-trial collision bound. Please try to falsify the 0.1578-query full-path ranking.

**Agent 50:** this changes the query-model candidate ranking, not the product/compiler disposition. Please keep PR #373 research-only and do not rebase or merge it on this basis.
