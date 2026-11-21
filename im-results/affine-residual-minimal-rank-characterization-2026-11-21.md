# Affine-residual rank is the minimum possible nonlinear output rank

**Date:** 21 November 2026. **Agent 50. Classification:** intermediate algebraic synthesis of the existing public-residual theorem, with an independent exhaustive small-domain checker. It is an intrinsic candidate-triage metric, not a new obfuscator architecture, security guarantee, or claimed novel conference theorem.

## Exact characterization

Let `V=GF(2)^n` and `F:V->V` be a **permutation**. For vectors `u,v`, define the affine-additivity defect

`B_F(u,v) = F(0) xor F(u) xor F(v) xor F(u xor v)`.

Let `R_F = span{B_F(u,v):u,v in V}` and `r_F=dim R_F`. Then

`r_F = min_{A in GL(n,2), c in V} dim(span{F(x) xor c xor A*x:x in V})`.

In words, the rank of all observable affine-additivity defects is precisely the smallest dimension of an output subspace capable of containing every non-affine displacement after removing an invertible affine baseline.

This does not assume a previously hidden representation `A+Wg`. If such a representation of output rank `r` exists, necessarily `r_F<=r`. Conversely a representation of **exactly** output rank `r_F` always exists for a permutation. This is an intrinsic output-rank lower and upper characterization; a full-domain proof is necessary to certify small rank, while a few observed defects merely give a certified lower bound.

## Derivation

1. For any invertible `A`, any `c`, and `E(x)=F(x) xor c xor A*x`, all four affine terms cancel:
   `B_F(u,v)=E(0) xor E(u) xor E(v) xor E(u xor v)`.
   Thus `R_F` lies in the span of `E(V)`; the minimum can never be below `r_F`.
2. Let `c0=F(0)` and build the public affine interpolant `M(e_i)=F(e_i) xor c0`. Let `D(x)=F(x) xor c0 xor M*x`. Then
   `B_F(u,v)=D(u) xor D(v) xor D(u xor v)`, so `span B_F <= span D`. Conversely `D(e_i)=0` and `D(x xor e_i)=D(x) xor B_F(x,e_i)`; induction on the Hamming weight of `x` gives `D(x) in span B_F`. Hence `span D=R_F`.
3. Because `F` is surjective, `V=im M+R_F`. Choose pivot columns of `M` spanning `im M`, choose a complement basis from observed residual directions in `R_F`, and add these vectors to the nonpivot columns. The resulting `H` is invertible, and every column of `H xor M` lies in `R_F`. Therefore `F(x) xor c0 xor H*x =D(x) xor (H xor M)*x` lies in `R_F`, achieving the lower bound.

This completion is exactly the constructive step appearing independently in Agent 39's 21 November quotient-completion inverter. The public-residual span and `im M+R=V` identity had already been derived by Agent 3 in [the 19 November public residual result](public-affine-residual-rank-target-inversion-2026-11-19.md). The minimum-rank equivalence and coordinate-invariance interpretation are emphasized here as a synthesis.

## Invariance under affine input/output wrappers

For any invertible linear maps `P,Q` and translations `b,d`, let `G(x)=Q F(Px xor b) xor d`. Its affine defect is

`B_G(u,v)=Q[ F(b) xor F(b xor Pu) xor F(b xor Pv) xor F(b xor Pu xor Pv) ]`.

The bracket is a second-order finite difference of `F` at base point `b`, and equals `B_F(b xor Pu,Pv) xor B_F(b,Pv)`. Thus it lies in `R_F`. Applying the same argument to the inverse coordinate transform gives `R_G=Q(R_F)`, so **`r_G=r_F`**. This means invertible affine wrappers can rotate the nonlinear displacement space but cannot change the minimum nonlinear output rank.

The permutation premise matters for the attainability proof: a constant function has zero affine-additivity defect rank, yet subtracting any invertible linear map leaves full-rank residual variation. The equality is not asserted for such nonpermutations.

## Reproducible independent evidence

[`sims/affine-residual-minimal-rank-peer.js`](../sims/affine-residual-minimal-rank-peer.js) enumerates all 40,320 permutations on 3 bits and checks both `dim span D=dim span B_F` and invariance under an independently chosen, nontrivial invertible input/output affine conjugation for every permutation. For 128 deterministically spaced permutations it **independently enumerates all 168 invertible 3×3 matrices** to compute the minimum attainable nonlinear displacement rank, which equals the public rank in all 128. The public rank distribution over the full 40,320 permutations is:

| Exact rank | Number of permutations |
| ---: | ---: |
| 0 | 1,344 |
| 1 | 9,408 |
| 2 | 18,816 |
| 3 | 10,752 |

The rank-zero class has `8 × |GL(3,2)|=8×168=1,344` affine permutations, providing an additional independent check.

**Immutable CI:** [manual Ubuntu/Windows run 44935344156](https://github.com/FlareZ123/obfs/actions/runs/44935344156), source `211d4d3199dba60d67d00fb8f881aaf044de9dd4`, completed successfully on both platforms. The independent structural verifier, its strict JSDoc gate, exact original rank-r peer inverter, matched earlier-algorithm comparison, and previously enrolled low-rank regression suites all passed. The test corpus is a finite computational witness for width three; the general proof above does the mathematical work for arbitrary `n`.

## Implications and limitations

This gives a mathematically intrinsic **exact** nonlinear output-rank score for permutations. A measured defect span of dimension greater than a proposed rank bound proves that bound false, even without source. Conversely a finite low observed rank is inconclusive because unqueried points can introduce new defect directions. Deterministic or adaptive sparse query attacks against candidate transforms must not treat small sampled rank as proof of a low-rank promise. No single scalar proves obfuscation resistance.

The result concerns deterministic fixed-width bijections with a total forward oracle. It does not cover general JavaScript control flow, stateful or non-injective functions, source access, tamper bypass, SCO account authorization, unrestricted attacker instruments, or the compulsory 2.5× compute budget. The project's three-mode strong-protection verdict remains **RELEASE-BLOCKED**.
