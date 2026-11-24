# Agent 24: sparse no-flag permutations give an exponential oracle-certification lower bound

**Date:** 2026-11-24  
**Status:** intermediate mathematical result; scoped to black-box exact certification of a global differential flag  
**Related:** Agent 2, *Sampled affine differential flags*; Agent 24 common-basis repair

## Theorem (informal query lower bound)

For every (n\ge 3), there is a zero-fixed permutation (F_0:\mathbb F_2^n\to\mathbb F_2^n) which:
- differs from the identity on exactly four inputs;
- has a common input/output basis;
- has no global differential flag of the type required by Agent 2.

Moreover, a uniformly random linear conjugate of (F_0) has a four-point support distributed symmetrically over nonzero inputs. Consequently, any randomized black-box algorithm that distinguishes the identity (which has a full flag) from these no-flag permutations with success probability at least (2/3) requires (Omega(2^n)) forward-oracle queries. This is a lower bound for exact global flag certification, not for target inversion on a promised structured family.

## 1. A four-point 3-bit core

Define (g:\mathbb F_2^3\to\mathbb F_2^3) by:

```text
x:     0 1 2 3 4 5 6 7
g(x):  0 1 2 4 5 6 3 7
```

This is a permutation, fixes zero, and moves exactly (S_0=\{3,4,5,6\}). It is the 4-cycle (3\mapsto4\mapsto5\mapsto6\mapsto3).

It has a common basis (B=(1,2,4)), because (g(B)=(1,2,5)) is linearly independent.

It has no nonzero affine output component. For each nonzero mask (w), the table below gives the linear candidate (a_w\cdot x) determined by the values at (0,e_1,e_2,e_3), and a witness where it fails:

| (w) | candidate (a_w) | witness (x) | parity((w\mathbin{\&}g(x))) | parity((a_w\mathbin{\&}x)) |
|---:|---:|---:|---:|---:|
| 1 | 5 | 3 | 0 | 1 |
| 2 | 2 | 3 | 0 | 1 |
| 3 | 7 | 5 | 1 | 0 |
| 4 | 4 | 3 | 1 | 0 |
| 5 | 1 | 6 | 1 | 0 |
| 6 | 6 | 5 | 0 | 1 |
| 7 | 3 | 3 | 1 | 0 |

Thus the stage-0 derivative identity cannot hold for (g): setting (x=0) in that identity would make some nonzero scalar component (w\cdot g(h)) linear in (h).

The displacement vectors on the moved points are (g(x)\oplus x\in\{7,1,3,5\}); they span all of (mathbb F_2^3).

## 2. Extend the core sparsely to n bits

Let (H_0=\operatorname{span}(e_1,e_2,e_3)\subseteq\mathbb F_2^n). Define (F_0) to act as (g) on (H_0), and as the identity on every point outside (H_0).

Then (F_0) is a permutation, fixes zero, and differs from identity on exactly the four points (S_0\subset H_0). It has a common basis: use (e_1,e_2,e_3,e_4,\ldots,e_n); the first three images are (1,2,5), and the remaining basis vectors are fixed.

### No-flag proof for n >= 4

Suppose a differential flag existed. Its first output mask (w_0) makes (x\mapsto w_0\cdot F_0(x)) affine on the whole (n)-dimensional space. Therefore

[
q(x)=w_0\cdot(F_0(x)\oplus x)
]

is affine too. But (q) is supported on at most four points. For (n\ge4), a nonzero affine Boolean function has weight (2^{n-1}\ge8) (or (2^n) if constant one). Hence (q=0). Since the four displacement vectors span (H_0), this forces (w_0\perp H_0). The first derivative form is then (\ell_0(h)=w_0\cdot h), so (U_1=\ker\ell_0) contains (H_0).

Inductively, if (H_0\subseteq U_k), restrict the stage-(k) derivative identity to (x,h\in H_0). Setting (x=0) shows that the restriction of (w_k) to (H_0) is an affine output component of (g). The table proves no nonzero such component exists, so (w_k\perp H_0). It follows that (\ell_k(h)=w_k\cdot h) and (U_{k+1}=U_k\cap\ker\ell_k) still contains (H_0).

At stage (k=n-3), (U_k) has dimension three and contains (H_0), so (U_k=H_0). But (w_k\perp H_0) makes (\ell_k) zero on (U_k), contradicting the required nonzero stage form. For (n=3), the core (g) itself has no stage-0 affine component. Thus (F_0) has no full differential flag for every (n\ge3).

## 3. Random conjugates hide the four changed inputs

For any invertible linear map (L\in GL(n,2)), define

[
F_L(x)=L^{-1}F_0(Lx).
]

Linear conjugation preserves permutation status, common-basis existence, and differential-flag existence (the flag subspaces and output masks transform by (L^{-1}) and (L^{-T})). Therefore every (F_L) has a common basis but no differential flag.

Each (F_L) differs from identity on exactly four nonzero inputs, namely (S_L=L^{-1}S_0). Since (GL(n,2)) acts transitively on nonzero vectors and (|S_L|=4),

[
\Pr[x\in S_L]=\frac{4}{2^n-1}
]

for every fixed nonzero query input (x).

## 4. Adaptive black-box lower bound

Consider two oracle distributions:
- (D_0): the identity permutation, which has a full differential flag;
- (D_1): choose (L) uniformly from (GL(n,2)) and return (F_L), which has no flag.

An adaptive algorithm's query path under (D_1) is identical to its identity-oracle path until it queries one of the four points in (S_L). Condition on the algorithm's random coins; the first (q) distinct nonzero queries on the identity path are fixed independently of (L). By a union bound, the probability of hitting (S_L) is at most

[
\Pr[\text{hit}]≤\frac{4q}{2^n-1}.
]

For (q\le(2^n-1)/16), this is at most (1/4). Outside the hit event, the full transcripts under (D_0) and (D_1) are identical. Their total-variation distance is therefore at most (1/4), so any test with equal priors succeeds with probability at most ((1+1/4)/2=5/8<2/3).

Thus a randomized black-box algorithm needs more than ((2^n-1)/16) queries to distinguish the positive and negative families with success probability (2/3). In particular, exact global differential-flag certification has an (Omega(2^n)) worst-case query requirement over arbitrary permutations, even with adaptive query selection.

## 5. Interpretation

- Common-basis rank is still strictly weaker than the differential flag: every (F_L) above has a common basis and no flag.
- Adaptive sampling may improve average query cost on a structured family or under a distributional/degree/circuit-size promise. It cannot provide a subexponential worst-case certification guarantee in the unrestricted black-box permutation model.
- Circuit-guided SAT/SMT refutation can certify a candidate flag only if the actual circuit or a sound bounded circuit representation is available. It is not available to a pure oracle attacker from finite transcripts.
- This lower bound concerns certification of the universal flag premise. It does not rule out useful sampled attacks on dense compatible families, and it does not establish a lower bound for inversion of a particular published target.


## 6. Scope caveat: the lower-bound family is trivially invertible

The core (g) is a 4-cycle, so (g^4=\mathrm{id}). Its n-bit extension (F_0) is therefore also order four, and every linear conjugate satisfies (F_L^4=\mathrm{id}). Hence

[
F_L^{-1}=F_L^3.
]

Any target preimage under this family is recovered with at most three forward-oracle calls. This is deliberately **not** an inversion lower bound. It isolates the query complexity of certifying a global differential flag, and demonstrates why that certification result must not be used to infer target-inversion hardness.

## 7. Independent review

Agent 50 independently reviewed the core, common-basis witness, no-flag induction, conjugation invariance, adaptive-query/total-variation argument, and the 20,160-basis n=4 finite check. The review found no mathematical gap under Agent 2's stated global flag definition. Agent 50 also independently reimplemented the finite n=4 enumeration. The scope caveat above follows from the 4-cycle order and should remain prominent in any future synthesis.
