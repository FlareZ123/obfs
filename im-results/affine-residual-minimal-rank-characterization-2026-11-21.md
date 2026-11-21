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

This defect-rank invariance also holds under the standard **extended-affine (EA)** transformation `G(x)=Q F(Px xor b) xor Lx xor d`, where `L` is any linear map, because every affine `Lx xor d` term cancels in the four-output defect. The defect-rank equality holds whether or not the EA-transformed `G` remains a permutation, while the minimum-*invertible*-baseline equality still requires bijectivity. The checker includes an independently chosen nonzero linear output addend for every width-three permutation and verifies the invariant again. This invariant should be understood in the existing Boolean-function EA-equivalence literature, not promoted as a first discovery.

The permutation premise matters for the attainability proof: a constant function has zero affine-additivity defect rank, yet subtracting any invertible linear map leaves full-rank residual variation. The equality is not asserted for such nonpermutations.

## Equivalent nonlinear algebraic-normal-form coefficient rank

Expand each output vector's Boolean algebraic normal form (ANF):

`F(x)=c_empty xor sum_i c_i*x_i xor sum_{|S|>=2} c_S * product_{i in S} x_i`,

where each coefficient `c_S` is an `n`-bit **output vector** and multiplication is over `GF(2)`. The basis interpolant removes precisely the constant and linear coefficients. Hence

`D(x)=sum_{|S|>=2} c_S * product_{i in S} x_i`.

Every evaluated residual is a linear combination of the nonlinear coefficient vectors. Conversely, the Boolean Möbius/Zeta transform is invertible, and each coefficient `c_S` is an XOR of residual evaluations at characteristic vectors of subsets of `S`. Thus their spans are **identical** and

`r_F=rank_{GF(2)}{c_S:|S|>=2}`.

This identity holds for **all** vectorial Boolean functions, even when the stronger statement about an *invertible* baseline requires a permutation. It supplies a direct algebraic route for exact candidate analysis when a tractable ANF or symbolic expression is already available. Full truth-table conversion costs exponential resources at large bit widths; the theorem does not promise an efficient generic symbolic extractor.

The independent verifier now performs the complete output-vector Möbius transform on **all 40,320 width-three permutations** and checks equality with the interpolation and parallelogram-defect ranks. The finite computation supplements the general linear-algebra proof and the dual output-mask result below.

## Equivalent affine output-component characterization

Let `R_F^perp` be the dual space of output masks `lambda in GF(2)^n` orthogonal to every vector in `R_F`. Then

`lambda in R_F^perp` iff the scalar Boolean function `x |-> lambda dot F(x)` is affine.

Indeed, orthogonality to every affine-additivity defect is exactly the assertion that `lambda dot (F(x) xor F(0))` is additive on input XOR; over `GF(2)`, additivity is linearity. Thus the set of affine output masks has dimension **`n-r_F`**, including any dependencies among visibly non-affine output coordinates.

Consequently a 32-bit permutation whose intrinsic residual rank is at most three has at least **29 linearly independent output combinations that are perfectly affine**. This is a structural reason the chosen-query reconstruction and target-inversion attacks can quotient away most of the input and output dimensions. It is an algebraic property of fixed-width functions, without establishing practical full-code reconstruction.

The independent verifier enumerates **all eight scalar output masks for all 40,320 three-bit permutations**, confirming that the logarithm of the number of affine masks equals `3-r_F` in every case. This is another mathematically independent way to audit the residual-rank metric.

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

## Exact finite-query noncertification and sparsity control

For `n>=3`, a deterministic adaptive oracle tester that has received the first `q<=2^n-2` answers of an affine identity permutation **cannot certify that the true residual rank is zero**: select two inputs `a,b` absent from its query transcript, and define the alternative permutation to swap exactly `a,b`, fixing all other inputs. Every recorded answer remains identical. The identity has rank zero; the alternative has rank **one** because its displacement is always either zero or the fixed vector `a xor b`, and it cannot be affine (a non-identity affine permutation on `GF(2)^n` fixes at most half of its points, while a transposition fixes `2^n-2`). Thus zero-error affine-versus-nonaffine certification on unrestricted permutation oracles requires **at least `2^n-1` distinct queries** in the worst case. At `2^n-1`, bijectivity fixes the final unqueried output, so the entire mapping is determined.

For a transposed pair chosen uniformly among the `2^n` points, a tester making `q` distinct choices has probability of detecting a discrepancy

`1 - ((2^n-q)(2^n-q-1))/(2^n(2^n-1))`.

Until detection every answer is identity, so adaptivity cannot improve this random-pair detection probability. At `n=32` and `q=33` (the 0-and-basis interpolation queries), this is approximately `1.536682242390952e-8`: virtually all random isolated two-point swaps evade such a sparse probe. This is a counterexample to interpreting a low *sampled* rank as a proof of global low rank.

The independent checker now tests **all 246 prefix lengths from 9 through 254** of an eight-bit query order that starts with the nine interpolation basis addresses. For each prefix, the code constructs an explicit rank-one transposition on two unqueried points, proves transcript equality and permutation bijectivity, and computes the full rank one. These 246 controls are additional to its all-permutation three-bit audit. Their updated two-platform source pin will be recorded when the extended workflow completes.

## High-rank rejection is a necessary filter only

A separate source-transparent 32-bit permutation `F(x)=Math.imul(x,0x9e3779b1)>>>0` provides a **high-rank but easily inverted** control. The multiplier is odd, so multiplication is a bijection modulo `2^32`. This candidate has **exactly 27 nonlinear output directions**. For the upper bound, the multiplier is `17 mod 32`, so its lowest five output bits equal `x xor ((x&1)<<4)` modulo 32; these five bits are affine, forcing every interpolation residual to have its lowest five bits zero. For the lower bound, the explicit input `17` has interpolation residual `0xfceff660`, whose least nonzero bit is bit five. The 27 input values `17 << k` for `k=0..26` yield precisely those residuals left-shifted by `k`, with distinct least nonzero bits 5 through 31; they are linearly independent. The verifier checks all 27 witness equations, full witness rank, low-five-bit affine behavior and an additional 512 seeded samples. Thus **the exact residual rank is 27**, while the inversion remains trivial under the declared family.

Yet if the attacker knows the source-level *odd modular multiplication* family, **one chosen query `F(1)` reveals the entire multiplier**. A five-step Newton inversion modulo `2^32` computes its inverse coefficient, and the verifier checks exact recovery of 64 independently chosen target preimages. That attack uses no further oracle queries once the multiplier is recovered. Distinguish this family-specific reconstruction from generic black-box inversion of an unknown permutation.

The contrast is deliberate: small residual rank certifies a candidate weakness under chosen-query access, while a large residual rank alone gives **no positive security lower bound** against source-aware algebraic attacks. This control is an explicit warning against using output-rank screening as a release metric without independent reconstruction and runtime adversaries.

## Implications and limitations

This gives a mathematically intrinsic **exact** nonlinear output-rank score for permutations. A measured defect span of dimension greater than a proposed rank bound proves that bound false, even without source. Conversely a finite low observed rank is inconclusive because unqueried points can introduce new defect directions. Deterministic or adaptive sparse query attacks against candidate transforms must not treat small sampled rank as proof of a low-rank promise. No single scalar proves obfuscation resistance.

The result concerns deterministic fixed-width bijections with a total forward oracle. It does not cover general JavaScript control flow, stateful or non-injective functions, source access, tamper bypass, SCO account authorization, unrestricted attacker instruments, or the compulsory 2.5× compute budget. The project's three-mode strong-protection verdict remains **RELEASE-BLOCKED**.
