# Adaptive anchor-pair selection and full-path m=7/m=8 comparison

**Status:** intermediate, attacker-side oracle-query result. This supersedes the fixed-first-two-anchor candidate ranking for the adaptive-pair policy described here. It is not a runtime benchmark or a compiler integration recommendation.

## Main finding

The 32-entry section table supports choosing the two anchor directions independently for each recovered basis vector, rather than always using the first two anchors.

For every unordered pair of distinct nonzero \(a,b\in\mathbb F_2^5\) (465 pairs), the map

\[
x\longmapsto
\big(H(x)\oplus H(x\oplus a),\;
H(x)\oplus H(x\oplus b)\big)
\]

is injective on all 32 inputs. This was exhaustively checked for the frozen table: **465/465 pairs pass**. Thus any two distinct anchor directions give a unique section-coordinate match. The learner can choose the pair minimizing new oracle inputs among \(v,v+a,v+b\), separately for each basis vector.

For the successful-trial extras, the learner can also reorder them after inspecting the cache: compute each extra's minimum pair cost, sort those costs ascending, and assign the largest basis-extension probability to the cheapest extra. This restores permutation invariance across direction labels.

## Exact full-path results

The exact objective includes repeated-trial witness queries and coordinate recovery with all directions from failed trials available as basis candidates.

| Policy | Witness queries | Coordinate queries | Full-path total |
|---|---:|---:|---:|
| m=7, globally optimal 10-face policy | 84.5029172817 | 76.0469473419 | **160.5498646236** |
| m=8, current 14-face candidate, optimized order | 84.4478744720 | 75.8647588920 | **160.3126333640** |

The current m=8 candidate is lower by **0.2372312597 expected distinct queries**. This is a comparison against the globally optimized m=7 policy, not a global m=8 result: the m=8 face-set search remains heuristic.

### m=7 global search

With best-pair selection and cost-sorted extras, the full-path objective is invariant under permutations of the seven direction labels. Each face is an edge of a simple graph on seven vertices. NetworkX's graph atlas supplies all 1,044 non-isomorphic seven-vertex simple graphs; the generator checks the full edge-count histogram.

The C++ subset DP optimizes every ordering for every graph representative, covering all labeled m=7 face sets and all cutoffs 1 through 21:

- 1,044 graph representatives
- 12,490,035 subset states
- 105,195,413 transitions
- Global optimum: cutoff 10, with a \(K_{2,5}\) face graph
- Best m=7 total: 160.549864623622
- Best cutoff-9 total: 160.703123528157
- Best cutoff-11 total: 160.863477040557
- Second-best graph at cutoff 10: 160.988187000372

The global second-best cutoff is 9, leaving a 0.1532589045 gap to the m=7 optimum. The winner and the best cutoff-9 and cutoff-11 candidates were independently re-evaluated with exact Python Fraction arithmetic. The C++ search uses long-double rank coefficients.

The canonical winning graph has complement-pair edges with indices 1 through 10 under the lexicographic \(\binom{[7]}2\) indexing. It is isomorphic to the existing m=7 \(K_{2,5}\) face set. Its optimal order is one five-edge star followed by the other.

### Follow-up: cache completeness in the m=7 graph-class search

A direction's singleton oracle value is cached in a failed trial iff that direction appears in at least one tested face. In the graph representation, an edge is an omitted pair. A vertex of degree k (incident to every selected edge) is therefore omitted from every face, so its singleton is not cached. The first m=7 graph-search implementation treated every prior-trial direction as singleton-cached; that was exact for graphs with no universal vertex, but optimistic for graphs with one or two universal vertices.

Corrected `sims/agent2-rankfive-m7-fullpath-face-order-dp.cpp` to count t universal vertices (t=0,1,2). For k failed trials, the expected number of cache-backed independent prior directions is now E[rank((7-t)k)] in GF(2)^27. The span of all 7k prior directions still determines whether successful-trial extras extend the basis, so the extra-direction independence coefficients continue to use the full rank distribution E[rank(7k)]. The successful-face pair costs already account for singleton misses within the current successful trial.

The winning K2,5 graph has no universal vertex, so its score is unchanged. The corrected exhaustive search still returns cutoff 10, K2,5, total 160.549864623622, with `uncacheable_vertices=0`. Manual-only workflow run [45573056357](https://github.com/FlareZ123/obfs/actions/runs/45573056357) succeeded after this correction. It reruns the exact m=7/m=8 adaptive-pair comparison, all 465 pair-signature checks, 10,000 seeded replay replicates per policy/mode, graph-atlas generation, and the C++ graph-class/order DP. The run reports 1,044 graph representatives, 12,490,035 subset states, and 105,195,413 transitions.

### Global finite-width collision bound for m=7

The collision correction can be bounded over every nonempty m=7 face set, not only the K2,5 winner. Across all 21 possible 5-faces, the query union contains at most the 120 subset masks of size 0 through 5 among seven directions, so Cmax <= 120. Any nonempty face set has per-trial miss probability at most the one-face miss:

[
f_{\max}=1-\prod_{i=0}^{4}(1-2^{i-5})
=0.701995849609375.
]

For seven uniform 32-bit direction words,

[
p_{\mathrm{dep}}(7)=1-\prod_{j=0}^{6}(1-2^{j-32})
\approx 2.9569491455\times 10^{-8}.
]

Substituting Cmax-1=119 and f=fmax into the existing conservative bounds gives:

| Stage | Maximum expected query savings from collisions |
|---|---:|
| Witness stage | 0.000845823 |
| Coordinate stage | 0.000490018 |
| Combined | **0.001335842** |

This is below 0.9% of the 0.153258904535 model gap between the K2,5 winner (160.549864623622) and the best cutoff-9 candidate (160.703123528157). Under the stated uniform 27-dimensional kernel-component model, finite-width dependence and cross-trial cache collisions therefore cannot reverse the m=7 graph-search ranking. This is a query-count bound, not a runtime or security claim.

### Numerical qualification

The graph-class search enumerates all 1,044 unlabeled seven-vertex graphs and all face orders, but its C++ DP uses double state costs with long-double rank coefficients. The winner and the best cutoff-9/10/11 candidates are independently re-evaluated with exact Python Fraction arithmetic; the complete 1,044-graph ranking is not yet accompanied by a formal interval-arithmetic certificate. Treat the exhaustive ranking as numerically reproduced with a large margin, not as an all-candidate rational-arithmetic proof.

### m=8 fixed-set order optimization

For the existing 14-face m=8 candidate, an exact subset DP over all \(2^{14}=16,384\) face subsets finds the best order under adaptive anchor-pair selection and cost-sorted extras:

1. (0, 1, 4)
2. (0, 1, 3)
3. (0, 1, 2)
4. (0, 1, 5)
5. (0, 1, 7)
6. (0, 2, 6)
7. (2, 6, 7)
8. (2, 3, 6)
9. (2, 5, 6)
10. (2, 4, 6)
11. (1, 6, 7)
12. (1, 3, 6)
13. (1, 5, 6)
14. (1, 4, 6)

The resulting expected miss probability is 0.1796246218. Expected face evaluations are 6.6750119329 and expected direction words are 9.7516334743. The face set itself is still only a heuristic candidate; no global m=8 set search has been completed.

## Finite-32-bit collision corrections

The injective-subset-mask model omits accidental 32-bit dependence and query collisions. A conservative expected-query-savings bound was calculated separately for witness and coordinate stages.

Let

\[
p_{\mathrm{dep}}(m)=1-\prod_{j=0}^{m-1}(1-2^{j-32}).
\]

For the witness stage, with per-trial query-union cap \(C_{\max}\), the bound is

\[
B_{\mathrm{witness}}=
\frac{(C_{\max}-1)p_{\mathrm{dep}}}{1-f}
+\frac{(C_{\max}-1)^2f}{(1-f)^2\,2^{27}}.
\]

For coordinate recovery, at most 81 queries are made. Adaptive pair selection considers at most six candidate inputs (the base vector and five anchor shifts) for each of at most 27 basis vectors. With \(M=(C_{\max}-1)/(1-f)\), the bound is

\[
B_{\mathrm{coordinate}}=
\frac{81p_{\mathrm{dep}}}{1-f}
+\frac{27\cdot6M}{2^{27}}.
\]

| Policy | Witness correction bound | Coordinate correction bound | Combined bound |
|---|---:|---:|---:|
| m=7, \(C_{\max}=93\) | 0.0000355195 | 0.0001552357 | 0.0001907552 |
| m=8, \(C_{\max}=123\) | 0.0000384265 | 0.0001853571 | 0.0002237836 |

These bounds condition on the five-bit projections and use uniform 27-dimensional kernel components for nonempty subset sums. Even subtracting the entire m=7 correction bound from the 0.2372313 model gap leaves more than 0.2370 expected queries in favor of the current m=8 candidate. Agent 43 is asked to independently check the conditional-uniform argument and the adaptive-pair union bound.

## Randomized replay

A 10,000-replicate replay used master seed

~~~text
b89a5ffa2ed9f00fd81efc3de0e06a5caa630fba2ab37b6001eac0c6f1986b29
~~~

with separate domain-separated direction and holdout streams. The replay used the optimized face orders, per-vector best-pair selection, and cost-sorted successful-trial extras. Each policy had 640,000 holdouts; all passed.

| Policy | Mean witness queries | Mean coordinate queries | Mean total | SE of total | Failure rate |
|---|---:|---:|---:|---:|---:|
| m=7 | 85.4443 | 75.9682 | 161.4125 | 0.6365 | 27.63% |
| m=8 | 84.8510 | 75.8217 | 160.6727 | 0.6356 | 18.06% |

The observed m=7 minus m=8 total-mean difference is 0.7398 with standard error 0.8995 (95% interval approximately [-1.0232, 2.5028]). The replay is therefore underpowered to resolve the exact 0.2372-query gap. Its means are consistent with the exact model; they do not independently establish the ranking.

## Reproduction

From the repository root:

~~~sh
python3 sims/agent2-rankfive-adaptive-anchor-pair-fullpath.py

python3 sims/agent2-rankfive-adaptive-anchor-pair-fullpath.py \
  --replay-replicates 10000 \
  --seed b89a5ffa2ed9f00fd81efc3de0e06a5caa630fba2ab37b6001eac0c6f1986b29

python3 sims/prepare-m7-fullpath-dp-data.py

g++ -O3 -std=c++17 sims/agent2-rankfive-m7-fullpath-face-order-dp.cpp \
  -o /tmp/m7-fullpath-dp
/tmp/m7-fullpath-dp sims/data/m7-fullpath
~~~

The Python exact comparison and replay were executed in the local research runtime. The C++ optimizer was compiled and run against equivalent generated data; its output gave the 1,044-graph global m=7 result above. The committed scripts should still be run from a clean checkout to confirm end-to-end reproduction.

## Repository artifacts and next work

- sims/agent2-rankfive-adaptive-anchor-pair-fullpath.py — exact m=7/m=8 fixed-set order DP, all-465-pair signature check, and optional seeded replay.
- sims/prepare-m7-fullpath-dp-data.py — generates the graph-atlas and kernel/cache data (requires NetworkX).
- sims/agent2-rankfive-m7-fullpath-face-order-dp.cpp — exact subset DP over all m=7 graph classes and face orders.
- im-results/agent2-rankfive-m7-vs-m8-all-trial-basis-2026-11-25.md — earlier fixed-pair baseline; superseded for the adaptive-pair policy ranking by this report.

**Decision:** among the current candidates, m=8 with adaptive anchor-pair selection and the optimized order is the preferred query-count candidate. The m=7 result is globally optimal within the stated m=7 face-policy class; m=8 is not globally optimal over face sets. Do not integrate this into the production compiler or treat it as evidence of a runtime or security improvement. Keep PR #373 research-only.

**Agent 43:** independently try to falsify the 465-pair derivative-signature property, the cost-sorted extra ordering, the m=7 graph-atlas symmetry reduction/global DP, and the adaptive-pair collision bound.

**Agent 50:** this changes the attacker-side query-model candidate ranking only. It does not change the production compiler or PR #373 disposition.
