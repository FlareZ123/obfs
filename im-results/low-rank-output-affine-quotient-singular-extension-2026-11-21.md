# Intrinsic low-rank output-affine quotients: permutation inversion without invertible affine base

**Agent:** 41  
**Date:** 21 November 2026  
**Status:** intermediate generalization of [the independent repaired-orbit argument](low-rank-affine-orbit-independent-review-2026-11-21.md), with exhaustive and structured singular-affine-source controls. Mathematical novelty and independent peer review remain open.  
**New reproducer:** [sims/low-rank-affine-singular-base-peer.js](../sims/low-rank-affine-singular-base-peer.js).  
**Inverter under test:** [sims/low-rank-orbit-independent-review.js](../sims/low-rank-orbit-independent-review.js).

## Strictly stronger theorem candidate

Let \(F:\mathbb F_2^n\to\mathbb F_2^n\) be a **permutation**. Query its value at zero and the \(n\) standard basis inputs. Define the sampled affine interpolant
\[
c=F(0),\qquad M e_i=F(e_i)+F(0).
\]
The intrinsic nonlinear displacement relative to those samples is
\[
D(x)=F(x)+c+Mx.
\]
Suppose its entire output image spans some fixed linear subspace \(W\) of dimension \(\rho\le r\). The attacker need not discover \(W\) or know which original affine decomposition the developer used.

**Claim:** A target output \(y=F(s)\) can be inverted with at most
\[
n+1+2^{\min(n,r+d)}\ \le\ n+1+2^{\min(n,2r)}
\]
distinct chosen-input oracle values, where \(d=\dim\ker M\) is computed from the sampled columns. The first formula uses the advertised bound \(r\); \(\rho\) can replace \(r\) if actually known.

In particular, **the hidden linear part \(A\) in a decomposition \(F(x)=c'+Ax+\eta(x)\), with \(\eta(x)\in W\), need not be invertible.** The previous invertible-\(A\) hypothesis is unnecessarily restrictive under the already-required bijectivity of the full function \(F\).

## Proof by surjective affine quotient

The quotient projection \(\pi:\mathbb F_2^n\to\mathbb F_2^n/W\) annihilates \(D(x)\), so
\[
\pi(F(x))=\pi(c)+\pi(Mx).
\]
Because \(F\) is a permutation, its quotient image covers **every** coset of \(W\). Therefore the linear map \(\pi M\) is surjective onto an \(n-\rho\)-dimensional quotient. Consequently
\[
\operatorname{rank} M\ge n-\rho,\qquad d=\operatorname{nullity}M\le\rho\le r.
\]
This is the missing inference in an attempted proof that would rely on \(A\) being invertible. It comes instead from the *full function's* surjectivity and the existence of a low-dimensional output-affine quotient.

Replace precisely the \(d\) linearly dependent columns of \(M\) with independent canonical coordinate vectors, obtaining an invertible matrix \(T\). The change has rank at most \(d\): \(\operatorname{rank}(T+M)\le d\). Form a new permutation, computable from the chosen oracle,
\[
G(x)=T^{-1}(F(x)+c).
\]
Its displacement from the identity is
\[
G(x)+x=T^{-1}\bigl(D(x)+(M+T)x\bigr)
 \in T^{-1}(W+\operatorname{im}(M+T)).
\]
The fixed displacement subspace on the right has dimension at most \(\rho+d\le r+d\). Every \(G\)-orbit stays inside one of its additive cosets and has at most \(2^{\min(n,r+d)}\) elements.

For target \(y\), compute \(z=T^{-1}(y+c)=G(s)\). Iterate \(G\) forward from \(z\) until the orbit returns to \(z\); the immediately preceding state is **exactly \(s\)** because \(G\) is bijective. The first \(n+1\) source evaluations construct \(M\), and at most \(2^{\min(n,r+d)}\) further evaluations traverse the cycle. Caching can reduce the distinct count. No invertibility of a developer-chosen affine \(A\) is invoked.

For a preexisting representation \(F(x)=c'+Ax+\eta(x)\), with all \(\eta(x)\) in a subspace \(W\) of dimension at most \(r\), the intrinsic \(D(x)\) also lies in \(W\) because each interpolation difference \(\eta(e_i)+\eta(0)\) lies there. Hence the generalized intrinsic statement subsumes the earlier theorem for **both singular and invertible A**, as long as the entire F remains a permutation.

## Exhaustive width-three control

The verifier enumerates every \(8!=40,320\) permutation of \(\mathbb F_2^3\). For each, it computes the exact intrinsic nonlinear output span from the entire eight-element truth table, then invokes the existing repaired-orbit inverter on **all eight possible target outputs** with the correct rank cap. No permitted source class is filtered out.

| Exact intrinsic nonlinear residual rank | Number of permutations | Exact target recoveries |
| ---: | ---: | ---: |
| 0 | 1,344 | 10,752 / 10,752 |
| 1 | 9,408 | 75,264 / 75,264 |
| 2 | 18,816 | 150,528 / 150,528 |
| 3 | 10,752 | 86,016 / 86,016 |
| **Total** | **40,320** | **322,560 / 322,560** |

The maximum observed distinct chosen queries was **eight**, and the longest orbit traversal was five steps. The rank-three case has a vacuous output-space constraint at \(n=3\); the rank-one/two cases are the meaningful low-dimensional controls. This is exhaustive over all 3-bit permutations and all targets, considerably broader than an \(A=I\)-only generator.

## Structured 32-bit singular affine baselines

For each \(r\in\{2,3,4,5\}\), independently generate invertible binary \(L,R\), a constant \(c\), and the permutation
\[
F(x)=R\bigl(Lx+\delta(\operatorname{high}(Lx))\bigr)+c,
\]
where \(\delta\) sets up to \(r\) low bits as disjoint ANDs of higher input bits, leaving the high bits unchanged. The triangular shear is bijective. Now deliberately choose as its hidden affine base
\[
A=R\,P_{\rm high}\,L,\qquad \operatorname{rank}A=32-r<32,
\]
with \(P_{\rm high}\) zeroing the lower \(r\) input coordinates. The residual
\[
\eta(x)=R\bigl(P_{\rm low}Lx+\delta(\operatorname{high}(Lx))\bigr)
\]
lies in the known \(r\)-dimensional output subspace \(R(\operatorname{low}_r)\). The test checks this subspace membership at 64 source inputs per constructed case and asserts the exact singular base rank. This is a true *singular-affine representation of a globally bijective function*, rather than a simulated nonbijective function.

At each rank, 96 generated sources and eight independently sampled targets were tested:

| Residual subspace dimension r | Hidden A rank | Exact target inversions | Maximum distinct attack queries | Theorem-wide cap |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 30 | 768 / 768 | 48 | 49 |
| 3 | 29 | 768 / 768 | 64 | 97 |
| 4 | 28 | 768 / 768 | 96 | 289 |
| 5 | 27 | 768 / 768 | 160 | 1,057 |

All **3,072/3,072** width-32 target inversions succeeded. The independent test seed is \`0x6a640626\`; the exhaustive width-three enumeration has no pseudorandom seed. Local Node.js v22.16.0 plus strict JSDoc checks passed. A new two-platform CI run is required to claim Windows and Ubuntu validation of this added generator.

## Candidate-selection implications and limits

This widens an exact **chosen-target permutation inversion** attack from invertible linear baselines to *all permutations admitting an output-affine quotient of codimension at most r*, regardless of whether the developer chose a singular, sparse, or otherwise unusual affine component. Simply making the affine component singular is not a valid defense while the complete function remains a permutation and the nonlinear output span stays small.

The inverter assumes a **permutation** and a valid upper bound on the intrinsic nonlinear output-span dimension. For noninjective functions, its cycle-predecessor step does not invert uniquely; an arbitrary target may have zero or multiple preimages. If the nonlinear span exceeds r, the claimed bound can fail. If the oracle is stateful, changes between queries, or forbids chosen-input access, the proof does not apply. Exact target inversion is a narrower goal than recovering arbitrary JavaScript source, cloning all outputs offline, or bypassing a server's authorization. No additional release or 2.5× performance guarantee follows. The repository remains **RELEASE-BLOCKED**.

This is a strengthened mathematical candidate result under review. It should remain in intermediate findings until independent reviewers check the quotient-surjectivity argument and literature novelty; a large exhaustive test alone is not evidence of academic novelty.
