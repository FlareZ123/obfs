# Eight-direction rank-five witness candidate: a 14-face path

**Date:** 2026-11-25  
**Status:** intermediate result. The candidate's finite-field and query-cost accounting are exact; its discovery is heuristic. No global optimality claim is made.

## Finding

A bounded search over eight-direction witness policies found a 14-face sequence with an exact expected repeated-trial witness-query cost of

\[
Q_8=\frac{74212724813}{880871355}=84.24922026554036.
\]

The existing seven-direction, ten-face policy has

\[
Q_7=\frac{2072004349}{24519915}=84.50291728172793.
\]

The eight-direction candidate therefore saves **0.25369701618757 expected distinct oracle queries** in the injective-subset-sum model. A conservative correction for 32-bit direction dependence and cross-trial collisions leaves an actual-uniform-32-bit advantage between **0.2536614562 and 0.2537355151 expected queries**, under the assumptions stated below.

This is a small query-count improvement, not a demonstrated runtime or compute improvement. The eight-direction policy performs more expected derivative-face evaluations and has a higher worst-case query cap. It is not proven optimal.

## Model

Let \(m\) be the number of uniformly sampled directions in \(\mathbb F_2^{32}\). Their projections under the fixed rank-five linear map form a \(5\times m\) binary matrix \(P_m\). Its full-rank probability is

\[
p_m=\prod_{i=0}^{4}(1-2^{i-m}).
\]

When \(P_m\) has rank five, its kernel \(K\) is a uniformly distributed \((m-5)\)-dimensional subspace of \(\mathbb F_2^m\). There are 2,667 such kernels for \(m=7\), and 97,155 for \(m=8\). The checker enumerates each subspace once using its unique reduced-row-echelon representation.

A fifth-derivative face is a five-element coordinate set \(S\subseteq\{0,\ldots,m-1\}\). Write its complement as \(T\), of size \(m-5\). The restriction \(P_m|_S\) has rank five exactly when the coordinate projection \(\pi_T|_K:K\to\mathbb F_2^T\) has full rank \(m-5\). Thus the face has a nonzero top derivative exactly when the corresponding kernel projection has full rank.

A face query evaluates the fifth derivative on all 32 subset sums of its five directions. The exact query-union cost of an ordered face sequence is the number of distinct coefficient-subset masks covered by its five-dimensional faces. The first trial includes the zero input; later trials reuse that cached zero input.

For a tested-face set \(A\), let \(R(A)\) be the number of full-rank projection kernels on which every tested face fails. The probability that the next face is reached is

\[
r(A)=(1-p_m)+p_m\frac{|R(A)|}{K_m},
\]

where \(K_m\) is the number of full-rank kernels. If \(E\) is the expected distinct query count in one fresh trial and \(f=r(A_{\rm final})\) is the probability that all faces in the trial fail, the expected query count over repeated fresh trials is

\[
Q=E+f(E-1)+f^2(E-1)+\cdots
=\frac{E-f}{1-f}.
\]

All finite-field counts, face-query unions, \(E\), \(f\), and \(Q\) below are computed with exact integer/Fraction arithmetic.

## Eight-direction candidate

The sequence below lists the **complement triples** \(T\), using zero-based direction indices. The tested derivative face is the other five directions.

| Step | Complement triple \(T\) | New distinct subset-sum queries | Remaining full-rank kernels failing every tested face |
|---:|---|---:|---:|
| 1 | (0, 1, 4) | 32 | 64,387 |
| 2 | (0, 1, 3) | 16 | 48,003 |
| 3 | (0, 1, 2) | 8 | 39,811 |
| 4 | (0, 1, 5) | 4 | 35,715 |
| 5 | (0, 1, 7) | 2 | 33,667 |
| 6 | (1, 6, 7) | 16 | 24,963 |
| 7 | (1, 3, 6) | 8 | 20,611 |
| 8 | (1, 5, 6) | 4 | 18,435 |
| 9 | (1, 4, 6) | 2 | 17,347 |
| 10 | (2, 6, 7) | 16 | 11,955 |
| 11 | (2, 3, 6) | 8 | 9,259 |
| 12 | (2, 5, 6) | 4 | 7,911 |
| 13 | (2, 4, 6) | 2 | 7,237 |
| 14 | (0, 2, 6) | 1 | 6,948 |

The total query union per trial is **123**, including zero. The exact values are

\[
p_8=\frac{948718575}{1073741824}=0.883563025854528,
\]

\[
E_8=\frac{37202797641}{536870912}=69.29561056382954,
\]

\[
f_8=\frac{192870469}{1073741824}=0.17962462175637484,
\]

\[
Q_8=\frac{74212724813}{880871355}=84.24922026554036.
\]

## Exact ordering optimality for the selected 14-face set

For a fixed selected face set, the final failure probability \(f\) is independent of face order. Therefore minimizing repeated-trial \(Q=(E-f)/(1-f)\) is equivalent to minimizing the fresh-trial expected query count \(E\).

The checker runs an exact subset dynamic program over all \(2^{14}=16,384\) subsets of the selected faces. For each subset \(A\), it computes the surviving-kernel count \(R(A)\), query-union size \(C(A)\), and exact reach probability \(\rho(A)\). Since

\[
p_8=\frac{a}{b},\qquad a=948718575,\quad b=2^{30},\quad K_8=97155,
\]

all reach probabilities share denominator \(D=bK_8=104319386910720\), with numerator

\[
w(A)=(b-a)K_8+aR(A).
\]

The integer DP recurrence is

\[
\operatorname{DP}[\varnothing]=0,\qquad
\operatorname{DP}[A\cup\{i\}]
=\min_i\left(
\operatorname{DP}[A]+w(A)\big(C(A\cup\{i\})-C(A)\big)
\right).
\]

It evaluates exactly **114,688 transitions**. For both the representative sequence above and the coordinate-permutation-equivalent C++ annealer sequence, the annealed order is returned as the exact optimum for that selected face set. The exact numerator for \(E_8\) is 7,228,875,609,622,710 over denominator 104,319,386,910,720; the final failure numerator is 18,738,330,415,695 over the same denominator.

This proves optimal ordering **within each selected 14-face set**. It does not prove that the selected face set is globally optimal among all \(\binom{56}{14}\) sets, nor that 14 is the globally optimal cutoff.

## Seven-direction comparison

The existing seven-direction ten-face sequence has 2,667 full-rank kernels, query union 93, and exact values

\[
p_7=\frac{26043255}{33554432}=0.7761494815349579,
\]

\[
E_7=\frac{1040519433}{16777216}=62.019791185855865,
\]

\[
f_7=\frac{9034517}{33554432}=0.2692495882511139,
\]

\[
Q_7=\frac{2072004349}{24519915}=84.50291728172793.
\]

The injective-model difference is

\[
Q_7-Q_8=\frac{4156624480}{16384207203}
=0.2536970161875705.
\]

## Correction for actual uniform 32-bit directions

The injective-subset-sum model treats distinct coefficient masks as distinct query points. Actual uniformly sampled 32-bit directions can only merge query points, reducing the distinct-query count.

For \(m\) directions, the probability of linear dependence in \(\mathbb F_2^{32}\) is

\[
P_{\rm dep,m}=1-\prod_{i=0}^{m-1}(1-2^{i-32}).
\]

If a trial's maximum query union is \(C_{\max}\), the repeated-trial expected savings from within-trial direction dependence are bounded by

\[
\Delta_{\rm within}\le
\frac{C_{\max}P_{\rm dep,m}}{1-f}.
\]

For nonzero cross-trial query points, condition on the five-bit projections of the directions. Each nonempty subset sum has a uniform component in \(\ker P\cong\mathbb F_2^{27}\), and face reach depends only on the five-bit projections. A pairwise union bound over at most \(C_{\max}-1\) nonzero points per trial gives

\[
\Delta_{\rm cross}\le
\frac{(C_{\max}-1)^2}{2^{27}}\frac{f}{(1-f)^2}.
\]

For the seven-direction policy (\(C_{\max}=93\)), the total correction is less than \(3.5559951\times10^{-5}\) expected queries. For the eight-direction policy (\(C_{\max}=123\)), it is less than \(3.8498883\times10^{-5}\). Therefore

\[
0.2536614562
<
Q_{7,\rm actual}-Q_{8,\rm actual}
<
0.2537355151.
\]

This bound assumes independent uniform 32-bit direction draws and the stated fixed rank-five projection model. It does not cover nonuniform or adversarial direction generation.

## Reliability and caps

Using the same \(10^{-10}\) per-run witness-miss target:

| Metric | Seven directions / 10 faces | Eight directions / 14 faces |
|---|---:|---:|
| Per-trial failure \(f\) | 0.2692495883 | 0.1796246218 |
| Required fresh trials | 18 | 14 |
| Witness-miss probability at cap | \(5.53084\times10^{-11}\) | \(3.64017\times10^{-11}\) |
| Maximum witness query union | 1,657 | 1,709 |
| Witness + 96 shift probes cap | 1,753 | 1,805 |
| Verified fast-path cap incl. 726 verifier samples | 2,479 | 2,531 |
| Signature-path cap incl. 992 probes + 726 verifier samples | 3,375 | 3,427 |
| Uncached additive (Q+96+726) query upper bound | 906.502917 | 906.249220 |

The eight-direction policy's expected total face evaluations over repeated trials are **6.825422**, versus **6.572655** for seven directions. Its expected direction-word count is **9.751633**, versus **9.579194**. Thus the candidate saves only about 0.254 expected distinct witness queries while using about 3.85% more expected face evaluations and having a 52-query higher fast-path cap. The witness-plus-shift caps (1,753 and 1,805) exclude verifier samples; the larger verified-path caps add the 726-sample verifier (or 992 signature probes plus 726 samples). The Q+96+726 row is an uncached additive upper bound, not an exact expected distinct-query count: shift and verifier points can overlap the query cache, which can only reduce the actual count.

For a simple weighted sensitivity model J=Q+lambda*F, where F is expected total face evaluations and lambda is the cost of one face evaluation measured in oracle-query units, the m=8 candidate beats the m=7 baseline only when lambda<1.00368245. This is a break-even calculation, not a measured CPU/network cost conversion.

For a simple weighted sensitivity model \(J=Q+\lambda F\), where \(F\) is expected total face evaluations and \(\lambda\) is the cost of one face evaluation measured in oracle-query units, the m=8 candidate beats the m=7 baseline only when \(\lambda<1.00368245\). This is a break-even calculation, not a measured CPU/network cost conversion. No CPU, wall-time, memory, initialization, or 2.5× runtime measurement was performed.

## Search method and optimality boundary

The eight-direction candidate was found by a bounded simulated-annealing search over ordered sequences of distinct complement triples. The C++ search program was run at cutoff 14 with eight random restarts (seeds 44000–44007), 100,000 moves per restart, a geometric temperature from 0.1 to \(10^{-5}\), and swap, replacement, and interval-reversal moves. Limited exploratory searches also examined cutoffs from 1 through 20; effort varied by cutoff, so the following are **best observed**, not proven minima. The C++ annealer returned a symmetry-equivalent sequence with the same per-step query increments and surviving-kernel counts as the representative table above; the exact Python checker validates both sequences:

| Faces per trial | Best observed repeated-trial query cost |
|---:|---:|
| 10 | 84.502917 |
| 11 | 84.548396 |
| 12 | 84.397028 |
| 13 | 84.293915 |
| **14** | **84.249220** |
| 15 | 84.451993 |
| 16 | 84.564700 |
| 17 | 84.560930 |
| 18 | 84.738884 |

This is **not** an exhaustive search over the \(2^{56}\) face subsets or all ordered 14-face sequences. The candidate is exact once selected, but its optimality among eight-direction sequences, cutoffs, other direction counts, or alternative witness algorithms is unproved. The seven-direction result remains the exact optimum only within its previously specified seven-direction complete-face/restart family.

## Reproduction

Run the exact checker:

    python3 sims/agent2-rankfive-eight-direction-witness.py

Run the sequence-level heuristic search (C++20):

    g++ -O3 -std=c++20 -march=native sims/agent2-rankfive-eight-direction-anneal.cpp -o /tmp/rankfive-m8-anneal
    /tmp/rankfive-m8-anneal 14 100000 8

Run the set-level annealer, which solves the ordering problem exactly for each proposed set:

    g++ -O3 -std=c++20 -march=native sims/agent2-rankfive-eight-direction-set-anneal.cpp -o /tmp/rankfive-m8-set-anneal
    /tmp/rankfive-m8-set-anneal 14 500 1

The Python script enumerates all 2,667 seven-direction and 97,155 eight-direction kernel subspaces, reconstructs face-failure sets and subset-sum query unions, and asserts the exact fractions, increments, caps, collision-correction interval, and fixed-set ordering DP for both candidate representatives. The sequence-level C++ program is a heuristic searcher; the set-level program uses exact DP for each face set but remains heuristic over the set space. Neither proves global optimality.

## Scope and next work

This is attack-side oracle-query research for one fixed rank-five projected-affine function family. It does not establish general SCO cloning resistance, static reconstruction resistance, COO/SNO protection, hostile-runtime integrity, domain locking, or compliance with the 2.5× compute budget. The query improvement is small and may be outweighed by additional derivative-evaluation work.

Keep the research in **im-results/**; do not promote it to **results/** or integrate it into the compiler based on query counts alone. The next useful checks are an independent peer review of the eight-direction kernel/face criterion and collision bound, followed—only if the result remains interesting—by a matched live-HTTP implementation and separate CPU/wall-time profiling.


## Independent peer review (Agent 43)

An independent standard-library Python checker is available at
\`sims/agent43-rankfive-m8-independent-check.py\`. It separately enumerates the \(m=7\) and \(m=8\) kernel subspaces in RREF, checks the complement-projection rank criterion, reconstructs the ordered face-failure counts and subset-mask query unions, and recomputes the exact rational expectations and 32-bit collision corrections.

The independent run matched:
- all 2,667 and 97,155 kernel counts;
- every remaining-kernel count and per-face query increment in the report;
- \(p_7,p_8,f_7,f_8,Q_7,Q_8\) exactly as rational values;
- both \(m=8\) sequence representatives, including their exact tie;
- the 18/14-trial miss bounds, 1,657/1,709 witness caps, 2,479/2,531 fast shift+verifier caps, and 3,375/3,427 signature+verifier caps;
- the within-trial dependence and cross-trial \(2^{-27}\) collision-savings bounds and the reported actual-uniform-32-bit query-gap interval.

The rank criterion follows because \(\ker(P)\cap\operatorname{span}\{e_i:i\in S\}=\{0\}\) exactly when the projection of \(\ker(P)\) onto the complementary coordinates \(T\) is injective; both spaces have dimension \(m-5\), so injectivity is equivalent to full rank. The cross-trial bound is valid after conditioning on the five-bit projections: each nonempty subset sum has an independent uniform component in the 27-dimensional kernel, while face reach depends only on the projections.

This peer check validates the supplied sequences and stated bounds; it does not validate the annealer's global search or establish optimality. The expected query saving remains only about 0.254, while expected face evaluations and direction words increase, so this result alone does not justify integration or a runtime claim.
