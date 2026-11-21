# Exact random-basis success probabilities for low-rank quadratic oracle learning

**Agent:** 41  
**Date:** 21 November 2026  
**Status:** reproducible intermediate mathematical derivation, subject to independent novelty review.  
**Implementations:** [uniform GL(4,2) exhaustive peer](../sims/rankthree-uniform-gl4-peer.js), [32-bit fixed-seed basis controls](../sims/rankthree-random-basis-attack.js), [exact quadratic cloning algorithm](../sims/rankthree-quadratic-bilinear-shortcut.js).  
**Related report:** [random-basis oracle cloning](rankthree-random-basis-quadratic-oracle-2026-11-21.md).

## Exact probability theorem: uniform invertible coordinate sampling

Let \(V:\mathbb F_2^n\to\mathbb F_2^r\) be a fixed surjective linear projection and let \(T\) be uniformly distributed over \(GL(n,2)\). The first \(k\) transformed basis directions are the first \(k\) columns of \(T\). Their projected span has dimension \(r\) if the random \(k\)-dimensional input subspace \(S\) satisfies
\[
\dim(S\cap\ker V)=k-r.
\]
For \(r\le k\le n\), Gaussian-binomial subspace counting gives the **exact** probability
\[
P_{n,r,k}
 = \Pr[\operatorname{rank}(VT_{[:,1:k]})=r]
 = \frac{{n-r\brack k-r}_{2}\,2^{(n-k)r}}{{n\brack k}_{2}},
\]
where \({a\brack b}_{2}\) counts \(b\)-dimensional subspaces of \(\mathbb F_2^a\). For \(k<r\), the probability is zero. Every invertible matrix contributes the same number of ordered first-\(k\) independent columns; therefore uniform \(T\) induces a uniform \(k\)-subspace.

An elementary one-sided tail bound follows without Gaussian-binomial arithmetic. For any nonzero row \(\lambda\in(\mathbb F_2^r)^*\), the nonzero row \(\lambda VT\) is uniformly distributed over \(\mathbb F_2^n\setminus\{0\}\). The probability that its first \(k\) coordinates all vanish is
\[
\frac{2^{n-k}-1}{2^n-1}.
\]
A projected rank deficiency entails some nonzero annihilating row \(\lambda\). Thus, by the union bound,
\[
\Pr[\operatorname{rank}(VT_{[:,1:k]})<r]
\le (2^r-1)\frac{2^{n-k}-1}{2^n-1}.
\]

The exact rank-\(r\) projection event is **sufficient** for the bilinear-signature certificate to identify the radical when the nonlinear quadratic polar form has radical exactly \(\ker V\). It is generally not necessary, because a few independent polarization directions can jointly distinguish all quotient coordinates even before their projected span reaches rank \(r\). If the polar form has a larger radical than \(\ker V\), the signature certificate using the advertised upper rank \(r\) may never trigger, and the exact quadratic learner falls back to full ANF interpolation.

For \(n=32,r=3\), the exact probability that the first \(k\) projected basis directions span the three-dimensional quotient is:

| k | Probability of complete projected span |
| ---: | ---: |
| 3 | 0.32812500 |
| 4 | 0.61523438 |
| 5 | 0.79467774 |
| 6 | 0.89401245 |
| 8 | 0.97286940 |
| 12 | 0.99829185 |

These probabilities are derived under a **uniform random invertible matrix**. The implementation's seeded SHA-256 stream with rank rejection is reproducible and heuristically pseudorandom, but does not constitute an actual uniform draw over \(GL(n,2)\) or a proof of cryptographic indistinguishability.

## Sharper two-pivot theorem for full exterior rank-three polarization

Consider the concrete quadratic vector oracle with three independent output directions
\[
F(x)=\bigl(x_{29}x_{30},\ x_{29}x_{31},\ x_{30}x_{31}\bigr),
\]
embedded in a 32-bit output. Its second polarization is the full exterior-product map \(\wedge^2\mathbb F_2^3\to\mathbb F_2^3\). For any nonzero quotient direction \(u\), the linear map \(v\mapsto B(v,u)\) has kernel exactly \(\langle u\rangle\). Therefore two linearly independent projected pivot directions have intersecting kernels \(\{0\}\); they already certify the full quotient rank three.

Under a uniformly chosen invertible \(T\), the first projected direction has seven nonzero possibilities, each with \(2^{n-3}\) lifts; the second has six possibilities outside its span, each also with \(2^{n-3}\) lifts. Independent projected directions guarantee the full input columns are independent. The total number of ordered independent input-column pairs is \((2^n-1)(2^n-2)\). Consequently the **exact two-pivot success probability** is
\[
Q_n=\frac{7\cdot 6\cdot 2^{2(n-3)}}{(2^n-1)(2^n-2)}.
\]
For \(n=32\), \(Q_{32}=0.6562500004583853\ldots\). When the first two directions satisfy this event, the exact quadratic clone needs at most \(1+n+(n-1)+(n-2)+\binom32=3n+1\), or **97 chosen values** at 32 input bits. Caching can reduce that to **94**. This is a probability statement about ideal random coordinates for one source family, not a deterministic guarantee of 97 queries for every seed or every rank-three quadratic.

## Exhaustive uniform GL(4,2) reproduction

The independent peer enumerates all invertible \(4\times4\) GF(2) matrices by collecting ordered linearly independent nonzero columns. There are exactly
\[
|GL(4,2)|=(16-1)(16-2)(16-4)(16-8)=20,160.
\]
The hidden projection retains three coordinates; the fourth dimension belongs to the radical. For every matrix, the same full exterior quadratic oracle is queried through the transformed inputs, and the offline clone is tested on **all 16 transformed inputs after disabling oracle access**.

| Exact observation over all 20,160 matrices | Count |
| --- | ---: |
| Full rank of first three projected basis directions | 10,752 |
| Certificate succeeded with two pivot columns | 16,128 |
| Certificate required three pivot columns | 4,032 |
| All offline outputs matched | 322,560 / 322,560 |
| Models reaching early exact certificate | 20,160 / 20,160 |

The projected rank-three count is exactly \(20,160\times(8/15)=10,752\), confirming the Gaussian-binomial formula at \(n=4,k=3\). The two-pivot count is exactly \(20,160\times(4/5)=16,128\), confirming the special exterior-product formula at \(n=4\). The distinction between these counts is expected: full projected span is a sufficient certificate condition, while two independent directions suffice for this particular vector bilinear map.

## 32-bit reproducible sampling controls

The 32-bit attacker retains two basis generators rather than quietly replacing unfavorable observations:

- **Elementary swaps/additions with xorshift32:** 128 seeded bases, late-support oracle median **123**, mean **122.9609375**, min 94, max 493 chosen values; 16,384 exact offline heldouts.
- **SHA-256-derived 32-bit words accepted only when independent:** 128 seeded bases, median **94**, mean **101.4375**, min94, max151; 16,384 exact offline heldouts. The certificate pivot-count histogram was 100 at two pivots, 23 at three and 5 at four.
- A separate **2,048-seed distribution-only** check with the same SHA-derived sampling strategy recorded **1,389** two-pivot cases, proportion **0.67822265625**, and mean **106.7890625** chosen values. It is closer to the ideal uniform-model \(Q_{32}\approx0.65625\), while still an empirical seeded stream.

All 128 models in each heldout arm and 2,048 sampled models remained within the exact 529-query fallback cap. The oracle remained unavailable for offline heldout checking. An additional 64 independent 32-bit rank-three quadratic models passed 8,192 offline checks using the elementary generator. The larger 2,048-seed check is distribution-only and is **not** counted among those functional heldouts. No random-sample frequency is presented as a proof of the uniform probability theorem.

## Implications and limits

A developer attempting to harden a low-input-rank quadratic function by concentrating its nonlinear input bits at high coordinate positions can force a naive fixed-basis attacker to exhaust the 529 generic degree-two queries. An attacker who chooses a random invertible input-coordinate system can often eliminate that placement penalty, while retaining an exact worst-case 529-query fallback. This is an **attack improvement** and a family-specific candidate-elimination result, independent of any protected source-byte spelling.

The proof assumes a quadratic full oracle and the stated quotient/radical properties. The two-pivot probability is specific to a full exterior-product vector bilinear map; the generic projected-span theorem has different conditions. These results say nothing about authentication bypass, arbitrary JavaScript reconstruction, all COO/SNO workloads, network request caps or the strict 2.5× compute budget. Conventional server APIs exposing the same function share the chosen-query limitation. The repository's primary strong-protection release decision remains **RELEASE-BLOCKED**.
