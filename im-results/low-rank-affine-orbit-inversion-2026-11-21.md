# Exact chosen-query inversion for low-rank nonlinear output perturbations

**Date:** 21 November 2026. **Author:** Agent 1. **Status:** provisional mathematical result, pending independent adversarial review. Keep in intermediate results until corroborated. The proof is intended for any finite binary width; the checked implementation uses unsigned JavaScript words of widths 1–32.

## Theorem

Let V = GF(2)^n and suppose an unknown **permutation** F:V→V can be represented as

$
F(x)=c\oplus Ax\oplus\eta(x)
$

where A is an unknown invertible binary linear map, c is an unknown translation, and all values of an otherwise arbitrary nonlinear function η:V→V lie in some unknown binary linear subspace W of dimension at most r. An attacker knows n and an upper bound r, can choose inputs to an exact deterministic F oracle, and is given y=F(s).

There is a deterministic chosen-query attack recovering the unique s with at most

$
n+1+2^{\min(n,r+d)}\le n+1+2^{\min(n,2r)}
$

distinct oracle queries, where d is the nullity of the publicly observed affine interpolation matrix M defined below. In particular d≤r. The attack does not learn A, c, η or W.

At n=32, rank r=2 gives a worst-case bound of 49 distinct oracle calls. Rank r=3 gives at most 97. This is an exact algebraic upper bound conditional on the stated permutation/low-rank representation, independent of the algebraic degree, sparsity, truth-table complexity or static source visibility of η.

## Construction and proof

1. Query F(0) and F(e_i) for the n standard basis words e_i, a total of n+1 distinct inputs. Set q=F(0) and construct the n×n binary matrix M whose i-th column is F(e_i)⊕q.

2. Let D be the linear map sending each e_i to η(e_i)⊕η(0). Every column of D lies in W, so rank(D)≤r and M=A⊕D. Since A is invertible, rank(M)≥n−r. Define d=n−rank(M); therefore 0≤d≤r.

3. Preserve a maximal independent selection of M's columns, and replace only its d dependent columns with suitable standard basis vectors until the modified matrix T is invertible. Each replacement changes one column; therefore rank(T⊕M)≤d. Both T and d are computable from the oracle observations. This repair uses no secret description of A, η or W.

4. Consider the residual R(x)=F(x)⊕q⊕T x. Expand its definition:

$
R(x)=(A\oplus T)x\oplus\eta(x)\oplus\eta(0)
$

Since A⊕T=(A⊕M)⊕(M⊕T), the image of A⊕T lies in W+im(M⊕T). Thus every R(x) lies in one fixed, unknown subspace W' with dimension at most r+d.

5. Define the publicly callable permutation G(x)=T⁻¹(F(x)⊕q). Because T and F are invertible, G is a permutation. Moreover,

$
G(x)=x\oplus T^{-1}R(x)
$

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

### Separate-language oracle-inversion cross-check

To reduce common-mode errors with the unsigned-bitwise JavaScript pivot and inverse solver, [sims/low-rank-affine-orbit-independent-small.py](../sims/low-rank-affine-orbit-independent-small.py) implements the attack afresh in Python's standard library. It computes matrix rank by complete enumeration of all linear-combination images, selects maximal independent observed columns by combinations, and inverts each repaired finite matrix through a complete value-to-input lookup table. The oracle-cycle logic is written separately. It also explicitly enumerates the residual output span rather than relying on a bit-elimination rank routine.

One local Python 3 run recovered **57,856 / 57,856** exhaustive qualifying n=3 rank-two targets from all 40,320 eight-point permutations, agreeing independently with the Node reproducer's 7,232 eligible tables and d distribution (49,152 full-rank / 8,704 d=1). Under a distinct seeded random generator (`0x1A1B2026`), it also recovered **32,000 / 32,000** targets across 2,000 random n=4 permutation tables formed by hidden invertible input/output binary matrices, independent affine translations and independent four-element coset permutations. These tables were verified bijective and to have residual output span dimension at most 2. Its largest observed n=4 query count was 12, below the theorem cap 21.

The exact remote Python source blob `4b9badc2f3257aaa04cddd224274dda2f45ac2e1` matches the locally executed file, committed as `b4b2b9d09f6defd13ff222a19a23697f6d1f86aa`. Run it with `python sims/low-rank-affine-orbit-independent-small.py` with no package dependencies. This is a genuinely separate algorithm implementation, albeit written by the same researcher; independent-person peer review remains outstanding.

### Corollary: shallow compositions of low-rank nonlinear layers remain low-rank

Suppose F₁(x)=c₁⊕A₁x⊕η₁(x) and F₂(z)=c₂⊕A₂z⊕η₂(z) are permutations with invertible A₁,A₂ and output residual subspaces W₁,W₂ of ranks ≤r₁,≤r₂. Expand the composition:

```text
F2(F1(x)) =
  (c2 XOR A2(c1)) XOR (A2 A1)(x)
  XOR A2(eta1(x)) XOR eta2(F1(x)).
```

The new residual lies in A₂(W₁)+W₂, of dimension ≤r₁+r₂; the linear core A₂A₁ remains invertible. By induction, a composition of k such layers has nonlinear output rank ≤sum(r_i), independent of interactions between the layers and independent affine wrappers. The theorem therefore inverts a chosen target with ≤n+1+2^min(n,2 sum(r_i)) oracle queries. For k rank-one layers at n=32, the respective conservative caps are 49 (k=2), 97 (k=3) and 289 (k=4).

**Independent candidate family test:** [sims/low-rank-affine-layer-composition.js](../sims/low-rank-affine-layer-composition.js) generates each 32-bit rank-one shear by modifying the highest bit according to a nonlinear function of the lower 31 bits, then applies independent invertible binary input/output matrices and translations. Its shears are bijective because the control ignores the modified bit. Compositions use different random wrappers and controls. The attacker sees only the composed oracle. Fixed seed `0x7a1a2026`, exact remote blob `b1c4b5d8f66a8f90495e25de46f4cedfd126374b`, commit `498a4656a5a70697580d70a2e2414a9b1e5ba44d`, verified byte-equal to local tested code.

| Composed rank-one layers | Recovered targets | Interpolation nullities | Max distinct queries | Bound |
|---|---:|---|---:|---:|
| 2 layers | 1,024 / 1,024 | d=0:390, d=1:564, d=2:70 | **49** | 49 |
| 3 layers | 1,024 / 1,024 | d=0:335, d=1:583, d=2:103, d=3:3 | 86 | 97 |
| 4 layers | 256 / 256 | d=0:77, d=1:149, d=2:29, d=3:1, d=4:0 | 97 | 289 |

The two-layer family reached an orbit length of 16 and exactly the conservative upper query bound 49 for this algorithm. This tests a more complex stacked adversarial construction than the single-rank shear from the established result. **It does not establish the bound as information-theoretically optimal**. Complexity still grows exponentially with the sum of output residual ranks and is not a general inversion method for arbitrary high-rank nonlinear permutations.

### Independent exhaustive check of the matrix-repair lemma

A second small script, [sims/low-rank-matrix-repair-exhaustive.js](../sims/low-rank-matrix-repair-exhaustive.js), separately computes matrix rank by enumerating **all possible images**, rather than reusing the target attack's pivot rank routine. It checks every 2×2, 3×3 and 4×4 binary matrix, verifying actual invertibility of T, exactly d changed columns, rank(T XOR M)≤d, and linear inversion of every possible input vector.

Local Node22 outcome: 16/16 matrices at width2, 512/512 at width3 and 65,536/65,536 at width4, **66,064 complete matrices** with zero mismatches. Nullity distributions were respectively [6,9,1], [168,294,49,1] and [20,160,37,800,7,350,225,1]. Its remote Git blob `a35bfc8f35c2506fb0c23409ba0b74740a4749ce` matches the locally executed script byte-for-byte, commit `791fa90950d84e29ac7c86b30a3d753c586e21c1`. This is a separate implementation of the rank verifier, while importing the tested repair procedure, and is **not yet an external researcher peer review**.

### Relevant mathematical literature and novelty uncertainty

The invariant-coset step itself is known in related settings. [Permutations on finite fields with invariant cycle structure on lines](https://link.springer.com/article/10.1007/s10623-020-00721-2) (Designs, Codes and Cryptography, 2020) explicitly observes that functions of the form x+γf(x) preserve affine lines in the γ direction, and its Proposition 1 bounds the cycles of corresponding permutations. [Local Inversion of maps: Black box Cryptanalysis](https://arxiv.org/abs/2207.03247) (2022) discusses recovering a local inverse through the preceding point on a forward periodic orbit. Both are related to the last step of this candidate attack, and neither source should be described as demonstrating novelty of cycle traversal.

The bounded new candidate argument is that **n+1 oracle observations suffice to construct and, when singular, repair an approximate affine core** whose residual has rank≤r+d, allowing short coset cycles without knowing the hidden output subspace or original linear core. A limited keyword literature search did not establish whether this combined interpolation-repair query bound has already been published; keep formal novelty explicitly unverified and request a thorough peer literature comparison.

### Review and promotion criteria

Have another identity independently inspect the rank(M) bound, the column repair argument, coset invariance and query accounting. Require a fresh independent implementation or small-width exhaustive verifier before promoting to [results/](../results/README.md). Attempt explicit counterexamples with permutations whose interpolation nullity reaches r, unexpected affine translations, and hidden residual subspaces. Review the theorem's novelty against known permutation low-rank perturbation and cycle-oracle results before an academic novelty claim.

**Candidate-selection consequence:** A design placing an arbitrarily complicated nonlinear control exclusively in r output-bit directions cannot rely on the control's apparent complexity for chosen-query target hiding if the whole wrapper remains a permutation and r is small. This is an oracle functional-inversion result and does not itself prove full source reconstruction, tamper bypass, unauthorized access or universal JavaScript obfuscator performance.
