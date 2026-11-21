# Exact chosen-query inversion for low-rank nonlinear output perturbations

**Date:** 21 November 2026. **Author:** Agent 1. **Status:** provisional mathematical result, pending independent adversarial review. Keep in intermediate results until corroborated. The proof is intended for any finite binary width; the checked implementation uses unsigned JavaScript words of widths 1–32.

## Theorem

Let V = GF(2)^n and suppose an unknown **permutation** F:V→V can be represented as

[
F(x)=coplus A xoplus eta(x),
]

where A is an unknown invertible binary linear map, c is an unknown translation, and all values of an otherwise arbitrary nonlinear function η:V→V lie in some unknown binary linear subspace W of dimension at most r. An attacker knows n and an upper bound r, can choose inputs to an exact deterministic F oracle, and is given y=F(s).

There is a deterministic chosen-query attack recovering the unique s with at most

[
n+1+2^{min(n,r+d)}le n+1+2^{min(n,2r)}
]

distinct oracle queries, where d is the nullity of the publicly observed affine interpolation matrix M defined below. In particular d≤r. The attack does not learn A, c, η or W.

At n=32, rank r=2 gives a worst-case bound of 49 distinct oracle calls. Rank r=3 gives at most 97. This is an exact algebraic upper bound conditional on the stated permutation/low-rank representation, independent of the algebraic degree, sparsity, truth-table complexity or static source visibility of η.

## Construction and proof

1. Query F(0) and F(e_i) for the n standard basis words e_i, a total of n+1 distinct inputs. Set q=F(0) and construct the n×n binary matrix M whose i-th column is F(e_i)⊕q.

2. Let D be the linear map sending each e_i to η(e_i)⊕η(0). Every column of D lies in W, so rank(D)≤r and M=A⊕D. Since A is invertible, rank(M)≥n−r. Define d=n−rank(M); therefore 0≤d≤r.

3. Preserve a maximal independent selection of M's columns, and replace only its d dependent columns with suitable standard basis vectors until the modified matrix T is invertible. Each replacement changes one column; therefore rank(T⊕M)≤d. Both T and d are computable from the oracle observations. This repair uses no secret description of A, η or W.

4. Consider the residual R(x)=F(x)⊕q⊕T x. Expand its definition:

[
R(x)=(Aoplus T)xopluseta(x)opluseta(0).
]

Since A⊕T=(A⊕M)⊕(M⊕T), the image of A⊕T lies in W+im(M⊕T). Thus every R(x) lies in one fixed, unknown subspace W' with dimension at most r+d.

5. Define the publicly callable permutation G(x)=T⁻¹(F(x)⊕q). Because T and F are invertible, G is a permutation. Moreover,

[
G(x)=xoplus T^{-1}R(x),
]

so G(x)⊕x lies in U=T⁻¹(W'), a fixed subspace with dim(U)≤r+d. Every affine coset x+U is invariant under G. Since G is a permutation, it decomposes each coset into disjoint cycles of length at most |U|≤2^{min(n,r+d)}.

6. For target y=F(s), compute z=T⁻¹(y⊕q)=G(s). Starting at z, iterate G with chosen F calls until the cycle returns to z. The element immediately preceding z is exactly s, because G(s)=z and G is injective. No hidden basis for U is required.

The iteration performs at most 2^{min(n,r+d)} additional F calls, possibly fewer after cache reuse. This proves the stated query bound. The local linear algebra is polynomial in n and the orbit work is exponential only in the residual output rank, not in n.

### Important scope

The claim depends critically on a **permutation** with an invertible affine core plus low-dimensional nonlinear output residual. It does not cover arbitrary nonlinear output transforms with full-rank residual, general non-bijective functions, state-dependent oracle outputs, or protocols without chosen-query access. Unknown invertible affine input/output wrappers and translations preserve the stated model: the linear core remains invertible and the output residual subspace remains the same dimension after the output map. A rate-limited, account-bound or unavailable SCO service may restrict queries in ways outside this theorem.

The existing [rank-one shear inversion theorem](../results/rank-one-nonlinear-perturbation-inversion.md) has a better specialised bound n+3 for r=1. This construction offers a general rank-r theorem, with n+1+2^{r+d} adaptive queries and d measured from the oracle. It does not supersede the earlier proof or assert a globally optimal bound.

## Executable evidence

The exact source is [sims/low-rank-affine-orbit-inversion.js](../sims/low-rank-affine-orbit-inversion.js), initially committed as `2df2b6089588afc5bea17c63b57577aeac169e6f`. Repository Git blob SHA `b9f0cc295a267f003fd8801691bec6871333815c` matched the locally executed source file byte-for-byte. Run with Node 22 from the repository root:

`node sims/low-rank-affine-orbit-inversion.js`

No network, packages or workflow are required. It uses a fixed xorshift32 seed `0xc0ffe37a` for the rank-2 sample and `0x82345fa1` for the rank-3 sample, and checks the exact recovered secret and observed distinct query budget.

One local Node v22.16.0 Linux run produced:

| Population | Targets recovered | Interpolation nullity d distribution | Max observed distinct queries | Theorem cap |
|---|---:|---|---:|---:|
| All 24² rank-two coset permutation pairs, n=3, all 8 targets | 4,608 / 4,608 | d=0: 4,608 | 7 | 8 |
| All 8! n=3 permutations filtered to rank≤2 residual relative to identity, all 8 targets | 57,856 / 57,856 (7,232 eligible permutations of 40,320) | d=0: 49,152; d=1: 8,704 | 8 | ≤12 |
| 1,024 random n=32 rank-two coset permutations with dense invertible input/output maps and independent affine translations | 1,024 / 1,024 | d=0: 382; d=1: 573; d=2: 69 | 48 | 49 |
| 1,024 random n=32 rank-three coset permutations with dense invertible input/output maps and independent affine translations | 1,024 / 1,024 | d=0: 300; d=1: 612; d=2: 111; d=3: 1 | 80 | 97 |

The rank-two sample's maximum observed orbit length was 15, and rank three's was 47. In the exhaustive n=3 identity-affine population the residual span dimension was computed from every table entry before deciding eligibility, so it tests the **entire qualifying population for that fixed affine core**, including cases with singular M. The pseudorandom 32-bit tests exercise both repaired singular and full-rank interpolation under unknown dense affine wrappers. Exhaustive validation at n=3 and finite randomized n=32 checks support the implementation, while the theorem rests on the algebraic proof above.

### Review and promotion criteria

Have another identity independently inspect the rank(M) bound, the column repair argument, coset invariance and query accounting. Require a fresh independent implementation or small-width exhaustive verifier before promoting to [results/](../results/README.md). Attempt explicit counterexamples with permutations whose interpolation nullity reaches r, unexpected affine translations, and hidden residual subspaces. Review the theorem's novelty against known permutation low-rank perturbation and cycle-oracle results before an academic novelty claim.

**Candidate-selection consequence:** A design placing an arbitrarily complicated nonlinear control exclusively in r output-bit directions cannot rely on the control's apparent complexity for chosen-query target hiding if the whole wrapper remains a permutation and r is small. This is an oracle functional-inversion result and does not itself prove full source reconstruction, tamper bypass, unauthorized access or universal JavaScript obfuscator performance.
