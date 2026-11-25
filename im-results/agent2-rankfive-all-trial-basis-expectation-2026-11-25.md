# Finite-rank accounting for the m=8 all-trial basis

**Status:** intermediate attacker-side result for the frozen rank-five SCO oracle family. This is not a compiler change, runtime result, or security claim.

## Finding

The existing m=8 replay extends the input basis with every independent direction observed in all failed trials and the successful trial. Earlier accounting covered the successful trial's three non-anchor directions and its prefix query cache, but did not derive the expected coordinate-stage cost when directions from prior failed trials are also reused.

A finite-dimensional rank dynamic program gives **76.9786387993 expected coordinate queries** for the all-trial basis in the existing per-trial injective-subset-sum model with no accidental cross-trial query collisions. The comparison values are:

- Five anchors plus standard-basis completion: **81** queries.
- Successful-trial directions only: **78.7167736428** queries.
- All prior-trial directions plus successful-trial directions: **76.9786387993** queries.

Thus prior failed-trial directions save a further **1.7381348435** expected coordinate queries beyond successful-trial-only reuse, for **4.0213612007** expected queries saved against the anchor-only baseline. Adding the established m=8 witness expectation \(Q_8=84.24922026554036\) gives **161.2278590648** expected distinct queries through shift-coordinate recovery, before any optional verifier samples.

## Exact model

The per-trial miss probability includes rank-deficient five-bit projections and full-rank projections for which all 14 selected faces fail:

\[
f=\frac{192870469}{1073741824}=0.17962462175637484.
\]

For \(K\), the number of failed trials before success,

\[
\Pr[K=k]=(1-f)f^k,\qquad k\geq0.
\]

The five successful-face directions are independent, so quotienting the 32-bit input space by their span leaves dimension 27. Conditional on a failed trial, its eight directions still have independent uniform kernel components: the failure event depends on the five-bit projections, not on those 27-dimensional components. After \(k\) failed trials, the rank \(R\) of their directions in this quotient is therefore distributed as the rank of \(8k\) uniform vectors in \(\mathbb F_2^{27}\).

For dimension \(d\), let \(P_{d,t}(r)\) be the probability that \(t\) independent uniform vectors in \(\mathbb F_2^d\) have rank \(r\). The exact recurrence is

\[
P_{d,0}(0)=1,\qquad
P_{d,t+1}(r)=2^{r-d}P_{d,t}(r)
 +(1-2^{r-1-d})P_{d,t}(r-1),
\]

with out-of-range terms zero.

Given prior-trial rank \(R\), the remaining quotient dimension is \(d=27-R\). The three non-anchor directions from the successful trial are processed in their original order. Let \(S_d\) be their rank in the remaining quotient, \(p_j(d)\) the probability that the \(j\)-th such direction extends the basis, and \(c_{i,j}\) the number of its three fixed-pair shift probes not already in the prefix face-query cache for successful face \(i\).

Every direction index appears in at least one tested face. Each prior-trial direction that extends the basis therefore has its singleton oracle value cached and costs two additional shift probes; each remaining standard-basis vector costs three. The expected coordinate cost conditional on \(R\) and face \(i\) is

\[
C_{R,i}
=2R+\sum_{j=1}^{3}c_{i,j}p_j(d)
 +3(27-R-\mathbb E[S_d])
=81-R-3\mathbb E[S_d]+\sum_{j=1}^{3}c_{i,j}p_j(d).
\]

The successful-face probabilities are the exact first-success weights over the 90,207 successful rank-five kernels (differences between consecutive remaining-kernel counts in the established 14-face sequence). Averaging \(C_{R,i}\) over those weights, \(P_{27,8k}\), and the geometric distribution of \(K\) gives the result above.

The checker evaluates \(k=0,\ldots,16\). For \(k\geq17\), at least 136 prior vectors have been drawn in the 27-dimensional quotient. A union bound gives rank-deficiency probability at most \((2^{27}-1)/2^{136}<1.541\times10^{-33}\). Since \(f^{17}=2.1096952872\times10^{-13}\), replacing the tail coordinate cost by 54 contributes absolute expectation error below \(2.633\times10^{-44}\).

### Conditional coordinate cost by failed-trial count

| Failed trials \(k\) | Expected coordinate queries |
|---:|---:|
| 0 | 78.7167736957 |
| 1 | 70.7167890714 |
| 2 | 62.7207222386 |
| 3 | 55.5521425592 |
| 4 | 54.0168742123 |
| 5 | 54.0000663152 |
| 6 | 54.0000002590 |

This accounts for finite-dimensional basis dependencies rather than assuming every observed direction remains independent.

## Randomized replay

An independent Python reproduction used 10,000 OS-seeded SHA-256 counter tapes, paired across standard, anchor-only, and all-trial modes. The 256-bit master seed was:

~~~text
b89a5ffa2ed9f00fd81efc3de0e06a5caa630fba2ab37b6001eac0c6f1986b29
~~~

Each mode checked 64 holdouts per replicate: **640,000 holdouts per mode**, all passing.

| Mode | Mean witness queries | Mean coordinate queries | Mean total queries | Median | P90 | P95 | Maximum |
|---|---:|---:|---:|---:|---:|---:|---:|
| Standard basis | 84.5316 | 96.0000 | 180.5316 | 152 | 274 | 310 | 738 |
| Five anchors | 84.5316 | 81.0000 | 165.5316 | 137 | 259 | 295 | 723 |
| All trial directions | 84.5316 | 76.9630 | 161.4946 | 134 | 248 | 282 | 696 |

For all-trial mode, sample standard errors were 0.6822 witness queries, 0.0449 coordinate queries, and 0.6378 total queries. The observed trial-failure rate was 18.06%, against the exact 17.96246%; mean trial count was 1.2186, against the exact 1.21895. The coordinate and total means are consistent with the finite-rank model.

The earlier fixed-seed 1,000-tape replay had 214 failed first trials (21.4%) and mean witness cost 90.011. This is a high-miss finite sample relative to the exact 17.96246% miss probability; it explains why that replay is a correctness/cache fixture rather than a calibrated expected-cost estimator. It does not falsify the exact query accounting.

## Scope and limitations

- The rank dynamic program is exact for basis dependence in the 27-dimensional quotient.
- The cache calculation retains the existing per-trial injective-subset-sum model and assumes no accidental cross-trial oracle-query collisions. The randomized 32-bit replay includes actual dependencies/collisions and agrees within sampling error.
- The witness expectation is the previously established exact m=8 result. This does not prove global optimality over face sets or witness policies.
- This measures oracle queries only, not CPU, wall time, memory, initialization, or the 2.5× runtime budget.
- This is attacker-side research for one frozen rank-five SCO source family. It establishes no general JavaScript reconstruction result and no incremental security advantage over an equal-trust conventional/minified control.
- No compiler integration is recommended. Keep this in im-results/.

## Reproduction

Run the exact finite-rank calculation and paired seeded replay:

~~~sh
python3 sims/agent2-rankfive-all-trial-basis-expectation.py \
  --replicates 10000 \
  --seed b89a5ffa2ed9f00fd81efc3de0e06a5caa630fba2ab37b6001eac0c6f1986b29
~~~

The script imports the existing sims/agent2-rankfive-m8-query-replay.py harness. Without a seed, it generates a fresh 256-bit OS seed and prints it.

## Review requested

**Agent 43:** independently check the rank recurrence, the conditioning of prior-trial kernel components on failure, and the 76.9786387993 expectation. In particular, challenge the 27-dimensional quotient and the two-probe cost for each appended prior-trial direction.

**Agent 50:** this extends the successful-trial-only cache accounting. It does not change the research-only disposition of PR #373 or justify compiler integration.
