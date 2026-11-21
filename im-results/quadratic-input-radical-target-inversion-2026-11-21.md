# Chosen-query inversion of quadratic permutations with small affine-input radical codimension

**Date:** 21 November 2026. **Agent:** 50. **Classification:** intermediate algebraic candidate-elimination result, with independent exhaustive and 32-bit tests. It applies only when the source/program supplies a trustworthy degree-2 permutation promise. Algebraic polarization, linear kernels and coset decompositions are established techniques; no originality claim is made for the components of this construction or their inversion use.

## Theorem and exact attack

Let `F:V->V` be a bijection of `V=GF(2)^n`, with every coordinate in algebraic normal form of degree at most two. Define its vector-valued polar form

`B(u,v)=F(0) xor F(u) xor F(v) xor F(u xor v)`.

For degree at most two, `B` is bilinear in both arguments. Define the common affine-translation **radical**

`U={u in V: B(u,v)=0 for every v in V}`,

with `dim U=n-d`. Then, given chosen forward queries to `F`, a target `y=F(s)` can be inverted exactly and deterministically using at most

`1+n+binom(n,2)+(n-d)+2^d+1`

distinct oracle queries, plus polynomial-sized GF(2) linear algebra and at most `2^d` coset enumerations. The (+1) at the end is an optional explicit inverse verification query; many queries overlap, so the bound is deliberately loose. This is a **query bound**, not a CPU, bandwidth, or general obfuscation resistance bound.

### Proof

1. Query `F(0)`, the `n` standard basis images `F(e_i)`, and all `binom(n,2)` pair images `F(e_i xor e_j)`. These uniquely determine all `B(e_i,e_j)` because `B(e_i,e_i)=0`. Bilinearity gives `B(u,v)` for arbitrary vectors by linear extension, so `U` is the kernel of the public linear map `u |-> (B(u,e_0),...,B(u,e_(n-1)))`. Gaussian elimination recovers a basis `u_1,...,u_(n-d)`.
2. For every `u in U`, `B(u,x)=0` implies **`F(x xor u)=F(x) xor F(u) xor F(0)`** for all x. In particular `L(u)=F(u) xor F(0)` defines a linear map on U. Since F is injective, L is injective and its image `L(U)` has dimension `n-d`. Query at most `n-d` additional `F(u_i)` to construct a linear solver for L, reusing known calls.
3. Choose an input complement `V=U direct-sum C` of dimension `d`. For each of its `2^d` representatives `x in C`, query `F(x)` and attempt to solve `L(u)=y xor F(x)`. Whenever such `u` exists, `F(x xor u)=y`; injectivity gives the unique preimage. The images of distinct U cosets are disjoint, so exactly one coset succeeds and the procedure terminates. One optional explicit check `F(x xor u)=y` detects some oracle/degree-promise violations.

This theorem needs the *global degree-two promise*. Finitely many black-box queries do not certify quadraticity for arbitrary functions. A cubic or higher polynomial can share all sparse basis and pair images and have a different hidden translation radical. A finite `n=3` truth-table checker can certify the premise; large `n=32` experiments instead use a known source-level quadratic construction and verify additional ranks.

## Why output-rank screening misses the tested case

The earlier negative attack uses the **output affine-interpolation residual rank** `r_out` to bound target-inversion search by a power of `2^r_out`. This new theorem uses the **input translation radical codimension** `d`. These independent structural dimensions should be evaluated separately, rather than assuming high output rank implies high input nonlinear complexity.

An exact 32-bit triangular family illustrates the distinction. Split x into a low eight-bit control and 24 other bits. Let `q_0,...,q_23` be 24 distinct quadratic monomials `x_i*x_j` of the eight low bits (selected from the 28 possible pairs). Define

`T(x) = x xor (q_0,...,q_23 shifted into output positions 8..31)`.

It is a permutation because the eight control bits remain unchanged and the high output bits are XORed with deterministic functions of those controls. Each quadratic monomial contributes a distinct, linearly independent output coefficient vector. Thus the exact public residual rank is **24**, while its affine-input radical is precisely the 24-dimensional high-coordinate subspace, i.e. **`d=8`**. The 24 selected monomials cover every control variable, excluding any extra radical dimension among the eight controls. Random invertible input and output matrices and an output translation hide the direct triangular coordinate system while preserving both dimensions.

The rank-output-only worst-case attack parameter would be `2^24=16,777,216`; the quadratic radical attack has a deterministic oracle bound of `1+32+496+24+256+1=810` on the same hidden quadratic family. **This comparison is of different proven upper bounds, not an empirical failure claim against every output-rank attack implementation.** The construction remains easy to invert by a source-aware adversary; the experiment measures additional black-box algebraic structure.

## Full nonlinear output rank 32, still low affine-input codimension

The rank-24 triangular pilot can be strengthened to a **full nonlinear output residual rank of 32**, while retaining a 23-dimensional common affine-input radical. This is a more decisive counterexample to using output-rank screening alone.

Use the finite field `K=GF(2^9)` defined by the irreducible polynomial `t^9+t^4+1` (binary `0x211`). The map `P(z)=z^3` is a **quadratic permutation** of the 512 elements because squaring is GF(2)-linear, multiplication is bilinear, and `gcd(3,511)=1`. Its bilinear polar form `B_P(u,v)=u^2 v xor u v^2` has trivial common radical: for any `u!=0`, choose a distinct nonzero `v!=u` to obtain a nonzero polar image. The 36 public basis-pair polar vectors include nine linearly independent directions spanning the entire nine-bit output.

Choose nine such independent input-basis pairs as *reserved witnesses*. The remaining 27 basis pairs provide at least 23 distinct quadratic monomials `q_0,...,q_22`. For an input split `x=(z,h)` with nine-bit `z` and 23-bit `h`, define

`T(z,h) = (P(z), h xor (q_0(z),...,q_22(z)))`.

The full 32-bit map is bijective because P is, and the 23 high bits can be recovered after z. It is still degree two. For the nine reserved basis pairs, polar differences have **zero upper output component** and span nine lower output directions. For each of the 23 selected monomials, its polar difference has a unique upper output bit, giving 23 more linearly independent directions modulo the lower span. Thus the **exact output nonlinear residual rank is `r_out=32`**, the maximum possible: there are **zero nontrivial affine scalar output masks**.

Yet all 23 high input directions have constant derivative, and the nine-bit field permutation has no nonzero input radical. Therefore the common radical is exactly dimension23, **`d=9`**. The promised quadratic chosen-query inverter needs at most

`1+32+binom(32,2)+23+2^9+1=1065`

distinct forward-oracle addresses per target. Arbitrary independently sampled **invertible affine input and output wrappers** preserve the maximum output rank and radical codimension while concealing the two-layer coordinate arrangement.

The independent checker validates that `z^3` is bijective and degree two on all 512 field elements, computes its exact public rank9, constructs ten distinct input/output matrices for the two 32-bit arms, and checks `r_out=32` via public polar queries on all five full-rank instances. On **40/40** hidden full-output-rank targets it recovered the exact preimage using **553–1,013** distinct chosen forward queries, all within the conservative 1,065 bound. This is a black-box algebraic candidate-elimination result even at maximum output rank, provided the global source-level quadratic promise is valid.

## Independent tests

- [`sims/quadratic-radical-target-inversion.js`](../sims/quadratic-radical-target-inversion.js) is a standalone CJS/JSDoc implementation. It constructs packed 1024-bit polar-form columns using built-in BigInt, computes the radical through GF(2) elimination, forms an input quotient complement, and solves output coset membership with independent basis elimination. It uses a cache to count **distinct** chosen oracle addresses.
- [`sims/quadratic-radical-peer-check.js`](../sims/quadratic-radical-peer-check.js) independently enumerates all **40,320 three-bit permutations** and attacks all **322,560** target values. Every three-bit permutation has degree at most two, since each balanced component's top ANF coefficient is zero. All targets invert exactly; observed maximum unique queries is eight. The codimension distribution over 40,320 permutations is `d=0:1344`, `d=1:0`, `d=2:9408`, `d=3:29568`.
- A separately constructed 4-bit affine-wrapped quadratic shear family passes **1,600/1,600** exact target inversions across 100 randomized matrix-wrapped instances.
- An independently generated 32-bit hidden quadratic family with exact `r_out=24`, `d=8` passes **80/80** targets over ten independently seeded affine wrappers, with **552 to 770** distinct queries per target in the first source-pinned CI run. The current checker also independently recomputes and asserts public output rank24 from 496 pair polar images on every hidden-32-bit instance.
- A second 32-bit family has **exact public output residual rank 32**, affine-input radical codimension nine, and independently randomized input/output affine wrappers; it passes **40/40** hidden targets, observed **553–1,013** distinct queries within the 1,065 deterministic upper bound. All full-rank polar tests and 512-element field-cube proof witnesses are in the checker.
- A deliberately excluded degree-three triangular permutation has a nonzero third-order derivative of value eight on inputs 0..7. It is an explicit warning that a general permutation does not meet this attack's bilinear premise.
- A further adversarial 8-bit permutation swaps exactly inputs 7 and 11 while preserving every input of Hamming weight at most two. Thus it has **exactly the same 1+8+28=37 basis-and-pair-query transcript as the identity** and would yield a falsely full-dimensional inferred radical if the degree-two promise were ignored. For target output seven, the nominal solver proposes preimage seven but the true preimage is 11; its explicit final forward-oracle verification rejects the invalid quadratic promise. The verifier asserts both complete transcript equality and this expected rejection. This shows precisely why basis-pair observations alone cannot certify quadraticity.
- A dedicated [strict JSDoc configuration](../jsconfig.quadratic-radical.json) is included in the cross-platform manual theorem workflow.

**First cross-platform CI:** [manual run 44936737513](https://github.com/FlareZ123/obfs/actions/runs/44936737513), source `51ae0e8addd2c2c0c078ea97cd9e6b534baba86e`, executed the exhaustive 322,560+1,600+80 exact test populations, strict JSDoc and the pre-existing output-rank inversion suite. The newer checker source additionally asserts the exact output rank24 on all hidden32 permutations; a later pinned run covers that increment.

## Matched source-level algorithm comparison at fixed query cap

The actual earlier output-residual target inverter [`sims/public-affine-residual-target-inverter32.js`](../sims/public-affine-residual-target-inverter32.js) was run on the same hidden quadratic/rank-24 family under the same per-target **1,100 distinct forward-oracle-address cap**, in [`sims/quadratic-radical-public-residual-cap.js`](../sims/quadratic-radical-public-residual-cap.js). Six independent 32-bit hidden affine-wrapped instances × four target inputs each produced the following source-pinned, two-platform result:

| Method | Exact targets within cap | Observed distinct oracle-address usage |
| --- | ---: | ---: |
| New quadratic-input radical inverter (given valid source-level quadratic promise) | **24/24** | 16,007 total, maximum 770 |
| Earlier generic public-output-residual target-growth inverter (no quadratic promise) | **0/24** | all 24 trials exhausted exactly 1,100 addresses (26,400 total) |

Both Ubuntu and Windows jobs passed at [run 44937077964](https://github.com/FlareZ123/obfs/actions/runs/44937077964), immutable source `6769c8a1408e52709e3e4398b8d503aa6570d736`, with strictly typed comparator, independent code and the previous low-rank regressions.

**Interpret narrowly:** This is a *query-capped comparison of the shipped experimental solvers on these 24 instances*. The older method's cap exhaustion is a finite sampled outcome; its published `2^r` target-inversion theorem remains valid with more queries. The new method receives the additional strong **global quadratic-degree promise**, which the old generic solver does not assume. This different side-information is the central reason the algorithms cannot be called apples-to-apples general security candidates. Both exploit forward chosen queries, and a source-aware attacker can sometimes extract even more from the known quadratic grammar.

## Related literature and boundaries

The second-order derivative `B` of a quadratic vectorial Boolean function and its bilinear radical/linear kernel are classical. Nyberg, [*Modifications of bijective S-Boxes with linear structures*](https://doi.org/10.1007/s12095-023-00631-9) (2023), Section 2, discusses affine decomposition along constant-derivative input structures, and Carlet and Villa, [*On cubic-like bent Boolean functions*](https://doi.org/10.1007/s10801-025-01415-5) (2025), discusses vectorial/Boolean derivatives and linear kernels in a broader context. A dedicated prior-art review is required before any claims about originality of this particular query algorithm, query accounting or 32-bit construction.

This is a deliberately restricted **chosen-query algebraic attack**, useful for screening families of fixed-width Boolean permutations. It does not prove semantics preservation for general JavaScript programs, nor source confidentiality, anti-tamper or anti-debug resistance, browser host locking, or satisfaction of the 2.5× runtime ceiling. The project's primary strong-obfuscation release decision remains **RELEASE-BLOCKED**.
