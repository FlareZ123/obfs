# Affine-interleaved low-rank permutation layers retain small global nonlinear output rank

**Agent 2 — 23 November 2026. Intermediate mathematical engineering corollary + source-pinned adversarial tests.** This is a candidate-veto for obfuscator designs built from layered low-rank nonlinear permutations, not an original generalized inversion theorem, a new backend, or a positive security demonstration. Retain in `im-results/` pending independent review and prior-art assessment.

## Claim and proof

Suppose an `n`-bit permutation layer `F_i:GF(2)^n→GF(2)^n` can be written

```text
F_i(z) = A_i z XOR b_i XOR W_i h_i(z)
```

with invertible GF(2) matrix `A_i`, arbitrary output translation `b_i`, arbitrary vector-valued nonlinear `h_i`, and `rank(W_i) ≤ r_i`. All matrices and nonlinear functions may be unknown; the `F_i` may have independent, unrelated affine input/output coordinates. Assume every layer is a permutation. Let `G_m=F_m ◦ ... ◦ F_1`.

**Exact compositional rank upper bound**:

```text
rank_output_nonlin(G_m) ≤ min(n, r_1+...+r_m).
```

To prove this, expand the recurrence:

```text
G_m(x)=A_m G_(m-1)(x) XOR b_m XOR W_m h_m(G_(m-1)(x)).
```

By induction, `G_(m-1)(x)=H_(m-1)x XOR c_(m-1) XOR E_(m-1)(x)` with invertible `H_(m-1)` and displacement `E_(m-1)` contained in a fixed output subspace `U_(m-1)` of dimension at most `∑_(j<m)r_j`. Define `H_m=A_m H_(m-1)` (still invertible), `c_m=A_m c_(m-1) XOR b_m`, and `E_m(x)=A_m E_(m-1)(x) XOR W_m h_m(G_(m-1)(x))`. Then every `E_m(x)` lies in **the fixed subspace `A_m U_(m-1)+im(W_m)`**, of dimension ≤`∑_(j≤m)r_j`. No smoothness, bounded degree, linearity, or independence of the nonlinear controls `h_i` is needed. This proves the formula.

The exact intrinsic affine-additivity output rank `r_{G_m}` of the [previously established defect/ANF characterization](affine-residual-minimal-rank-characterization-2026-11-21.md) is therefore ≤that sum. The `n+1` public basis-interpolation samples produce residuals within the same subspace, so the **existing deterministic low-rank target inverter** from [Agent 7's theorem](affine-low-rank-deterministic-completion-2026-11-21.md) inverts arbitrary targets from a forward oracle in at most

```text
n + 1 + 2^min(n,2r),  r = r_1+...+r_m,
```

assuming `r≤16` for the current 32-bit implementation. If interpolation nullity `d` is available, its stronger bound is `n+1+2^min(n,r+d)`. The output nonlinearity *rank* stays small even when composition increases program length, mixes all observable coordinates, and raises algebraic degree. This is a mathematical corollary of existing methods, **not** a claim that the attacker learns every hidden layer's source. At n32, the elementary r1..r5 worst-case bounds are 37,49,97,289,1057; the rank-one specialist supplies 35 in the one-layer case.

### Why arbitrary affine wrappers do not help

The layer displacements occupy `im(W_i)` at each stage, but all earlier displacements are merely rotated by the invertible downstream matrices. Their final output span is contained in

```text
U = span( A_m ... A_(i+1) im(W_i) : i=1,...,m ).
```

The vectors may become high-Hamming-weight, the source predicates may gain complicated dependencies through prior layers, and no single shared affine conjugation needs exist. None can increase the dimension of `U` beyond the sum of the original ranks.

## Source-pinned 32-bit adversarial test

[`sims/layered-rankone-crosswrapped-inversion.js`](../sims/layered-rankone-crosswrapped-inversion.js), checked by [`test/layered-rankone-crosswrapped-inversion.test.js`](../test/layered-rankone-crosswrapped-inversion.test.js), generates **60** deterministic 32-bit bijective sources: twelve each with one through five genuinely nonlinear **rank-one top-bit shears**. Each stage toggles bit 31 by the lower-coordinate quadratic predicate `(z_0∧z_1) XOR parity(mask∧z_<31)`, then applies a newly randomized invertible 32×32 binary matrix and output translation; both global input and output use distinct affine transforms. Thus each nonlinear step is a permutation and the full implementation is a permutation, with no degenerate same-basis-conjugation assumption. The attacker sees only the complete fixed forward oracle and the **sum-of-layer-ranks bound `r=m`**; original shears, matrices, offsets, secrets, and original preimages are withheld.

The harness separately samples 160 residuals from each source after the public interpolation frame. All **60/60** samples reach the full output nonlinear rank equal to the layer count and none exceeds the promised bound. Against three held-out targets for each source, the **unmodified** Agent 7 deterministic attacker exactly recovers **180/180** hidden preimages, with **zero** rank/cap violations. Observed max total chosen oracle calls by one to five layers: **37 / 41 / 48 / 65 / 157**, respectively; global max interpolant nullity was two. The experiment demonstrates that additional nonlinear layers do not defeat the stated rank-sum attack at these depths and cases.

**Source-pinned test:** [focused Ubuntu/Windows Node22 45110710367](https://github.com/FlareZ123/obfs/actions/runs/45110710367), immutable SHA `5fdfce1429e9896d0a65114852ef55c9da59e147`, both focused tests and strict project/external JSDoc successful. The generated family and seeds are public and deterministic. The 180 examples are reproducible **attack successes**, not statistical guarantees for all nonlinear functions.

## Algebraic degree is a separate axis

Algebraic degree is the maximum input-monomial cardinality among nonzero vectorial ANF coefficients. A small output nonlinear rank does **not** imply a low algebraic degree: a single top-bit gate may depend on a high-degree AND of nearly all lower input coordinates while its nonlinear output rank remains one. Conversely repeatedly applying an independent rank-one quadratic shear can raise the degree while total global nonlinear output rank stays bounded by the **number** of layers. A **complete eight-bit ANF audit** checks **all 256 truth-table outputs** of **288** independently seeded source functions (48 instances for each one through six rank-one shear layers). For each instance it computes the full algebraic-normal-form coefficient map by the binary Möbius transform, the maximum nonzero monomial degree, and the exact nonlinear coefficient-output span rank. Every one of 288 source functions remains bijective, and **288/288** respect `ANF output rank ≤ layer count` with no sampling assumption. Maximum degrees for layers 1 through 6 are **2, 3, 4, 5, 6, 7** while maximal observed ranks are **1, 2, 3, 4, 5, 6**. In the six-layer group, 38/48 sources achieve output rank six, while 33/48 have degree at least six; a degree-seven witness exists. The test explicitly distinguishes the max-degree condition from rank: both may rise with layers, but the output rank remains bounded by the number of layer directions, not degree. [Focused Ubuntu/Windows two-platform Node 22 and strict JSDoc run 45110837341](https://github.com/FlareZ123/obfs/actions/runs/45110837341), exact source `72a44e4a60adb658b0c117198491f5b62b43c7c6`, verified the entire eight-bit audit along with the earlier 32-bit attack. This is exact for **these 288 small-width sources**, not a statistical estimate of wider families. Complexity of the nonlinear control code and the *dimension of its affected output space* are distinct.

## Oracle-only whole-function cloning from the quadratic layer count

The same layered test family has a **separate exact functional clone** attack when each nonlinear stage uses one genuine Boolean AND of two linear combinations, with only linear/XOR/NOT operations otherwise. Unlike the rank-sum inverse bound, this depends on a **low-degree control circuit promise**. The known Boolean multiplicative-complexity **degree bound** says `AND-count ≥ deg(F)-1`: a vectorial Boolean circuit with at most `m` nonlinear two-input AND gates has algebraic degree at most `m+1`. This is established background, e.g. the [NIST/PMC treatment of upper bounds on multiplicative complexity](https://pmc.ncbi.nlm.nih.gov/articles/PMC7047778/) and the [NIST overview on four-/six-variable multiplicative complexity](https://pmc.ncbi.nlm.nih.gov/articles/PMC7802510/). Our stage gate is `z_0 AND z_1` XOR an affine Boolean mask (the bitwise parity implementation is semantically linear), and every other stage transformation is affine. Therefore a source with `m` such gates has `deg(G_m)≤min(n,m+1)` even after all independently mixed affine layers. The bound is an existing multiplicative-complexity theorem, **not novel**.

For any unknown vectorial Boolean oracle `F:GF(2)^n→GF(2)^n` **promised** to have ANF degree≤d, the complete function is determined by values at exactly the Boolean vectors of Hamming weight at most `d`. If `a_M` is the coefficient vector of monomial `∏_(i∈M)x_i`, Boolean Möbius inversion gives

```text
a_M = XOR_(T⊆M) F(1_T),     for |M|≤d,
a_M = 0,                  for |M|>d.
F(x) = XOR_(M⊆supp(x), |M|≤d) a_M.
```

One chosen forward call returns **all n output bits**; thus exactly `Q(n,d)=Σ_(j=0)^d binom(n,j)` chosen requests suffice for a **complete, offline, exact functional clone**, with no program source, hidden layer information, factorization, stored secret, or additional oracle calls for new inputs. Reconstruction can be precomputed; the resulting polynomial evaluator may have runtime different from the original, so this is functional extraction not a matched-performance result.

| Number of independent quadratic layers `m` | Promised ANF degree≤ `m+1` | `Q(32,m+1)` total chosen queries |
|--:|--:|--:|
| 1 | 2 | **529** |
| 2 | 3 | **5,489** |
| 3 | 4 | **41,449** |
| 4 | 5 | **242,825** |
| 5 | 6 | **1,149,017** |
| 6 | 7 | **4,514,873** |

These are attack upper bounds, not lower bounds or a claim that a provider would allow that volume at one session. The experiment's threat model permits unlimited legitimate chosen requests; this makes the clone attack relevant to a public SCO API implementing a deterministic low-degree function without additional server-private per-request state. General COO/SNO hostile-runtime controls are much stronger than this black-box oracle model.

**Reproducible source-level attacker tests.** The extended [`sims/layered-rankone-crosswrapped-inversion.js`](../sims/layered-rankone-crosswrapped-inversion.js) includes a generic Boolean ANF cloner that takes only an opaque forward-oracle callback and declared degree, then queries every low-weight input mask, extracts all coefficient vectors, and predicts outputs at any held-out input.

- For **144 independently seeded eight-bit layered permutations** (24 each for one through six quadratic layers), the attacker uses only **37 / 93 / 163 / 219 / 247 / 255** queries per source respectively, predicts **36,864/36,864** evaluated input/output pairs correctly, including **12,528** genuinely *unqueried* addresses, without reading source internals. The fixed function's degree bound is proved by its one-AND-per-layer construction, and a separate full truth-table ANF audit confirms it for 288 additional sources.
- For **20 independently seeded 32-bit** layered permutations (ten one-stage and ten two-stage), the attacker spends **529 or 5,489 chosen requests per source** (total **60,180**), then predicts all **1,920/1,920** separately sampled *unqueried* 32-bit input/output pairs exactly. It receives only a forward oracle and degree, not matrix factors, gate truth tables, offsets, or hidden secret. This sample validation combines with the algebraic degree bound to justify an exact whole-domain clone for these constructed sources, without exhaustively executing all `2^32` inputs.
- A **negative control** shows why the degree promise matters: the top-bit shear `T(x)=x XOR 0x80000000·1[(x&15)=15]` is a rank-one, degree-four, involutive permutation. Its low-weight-input answers for degree two or three are indistinguishable from identity. Both the 529-query degree-two and 5,489-query degree-three clone algorithms predict `T(15)=15`, but the actual output is `0x8000000f`. Thus a low residual rank **does not** imply a low polynomial degree or safe general-purpose cloning from only the low-weight ANF frame.

**Two-OS source pin for all these claims:** [manual focused Ubuntu/Windows Node22 and strict JSDoc run 45111760117](https://github.com/FlareZ123/obfs/actions/runs/45111760117), source SHA `da7d1cf0119ba426e3df1cc08f1de45868135ff4`, all four focused regression tests and both strict project/external JSDoc passes. Initial CI red runs following the cloner extension were only an explicit TypeScript inference issue in this file and concurrent strict-check errors in another agent's unrelated test; no inversion or cloning counterexample was observed. They remain in the historical CI record.

**Practical triage:** A hidden or layered affine-mixed Boolean function that has *both* small global nonlinear output rank and small multiplicative complexity is susceptible independently to **fast target inversion** and **full offline functional cloning**. Adding affine matrices or source-level syntactic camouflage does not change either algebraic weakness. This is negative candidate selection, not an obfuscator improvement.

## Limits and research decision

- **Attack-side sufficient condition only.** An exact source-level decomposition is required for the rank-sum promise. A small *sampled* rank cannot certify arbitrary opaque code; rare unobserved deviations can invalidate it. The min-rank characterization's existing sparse transposition control is relevant.
- **Only invertible fixed-width state transformations.** Does not prove invertibility or any attack on arbitrary JavaScript objects, nonbijective functions, stateful RPCs, callbacks, opaque native APIs, or effects. Input and output domains must permit the chosen-forward oracle to be called at arbitrary bit strings.
- **No positive protection claim for high rank.** Composition beyond ~16 independent rank-one directions may escape this *particular low-rank* bound but need separate cryptanalytic and runtime assessment. The absence of this attack is not evidence of security; e.g. high-rank modular multiplication is trivially learned from one chosen call under its source family.
- **No universal 2.5× compute validation.** Many affine mixing layers may themselves be costly, and the attacker's chosen-query count measures only adversarial access, not the protected application's runtime. Any backend built from such layers needs native-versus-transformed workload timing on actual Node/browser deployments.
- **Mode relevance:** In SCO, an attacker with unlimited authorized chosen requests can potentially exploit a public low-rank API; SNO and COO hostile-runtime access additionally permits static/trace/patch attacks. The result does not bypass an account boundary or prove unauthorized execution.
- **Research decision:** Treat low-rank-per-layer affine interleaving as **vulnerable to bounded-query exact inversion** whenever the total displacement rank remains small, even if code structure and nonlinear degree seem complicated. Require independent invertibility/rank assessment, source-aware attacker baselines, and 2.5× profiles before claiming added protection. The project's strong release decision stays **RELEASE-BLOCKED**.



## Cross-family challenge: bounded-degree affine-flag inversion is not a generic low-degree permutation inverter

To compare the bounded-degree affine-coset method in the separate two-sided-affine report against this broader layered family, I ran a local line-for-line port of its solveLinear/invertBoundedDegree logic using the exact source generator and deterministic seed schedule in sims/layered-rankone-crosswrapped-inversion.js. The port was matched against sims/two-sided-affine-degree-inversion.js as it stood at source SHA 920ce49f0ad14386c50ba84ca55955be5fd4aceb; the layered generator SHA was bc66c8718da246d0d1a4a095cf5db2a236b4b6a9. This was a local exploratory check, not a new CI/source-pinned test.

For four sources each, the bounded-degree flag method recovered all targets for one, two, and three layers at declared degrees 2, 3, and 4, respectively:
- one layer: 3,027 / 3,006 / 3,019 / 3,022 distinct oracle calls;
- two layers: 23,498 / 23,430 / 23,507 / 23,427;
- three layers: 141,915 / 142,101 / 142,190 / 142,301.

For four layers at degree bound 5, the first four deterministic sources were mixed. Seed 1408068602 refused at residual dimension 3 after 695,873 calls; seeds 3526619077, 1366844368, and 3515803579 inverted exactly after 695,487, 696,790, and 695,759 calls. The D=5 direct-online worst-case bound is Q(32,5)=1,431,840; the routine's default 300,000-call budget is insufficient for these sources, so the local check used 2,000,000.

The failing seed's final three-dimensional coset is a genuine permutation on eight points. Its three nonzero nonlinear vector ANF coefficients are 0x7, 0x4, and 0x6, which have rank 3 over GF(2). No nonzero output parity annihilates all nonlinear coefficients, so there is no nonconstant affine output parity on that residual coset. This is a structural refusal, not an oracle or row-reduction error. The same source is inverted by the separate rank-sum low-rank method already tested in this report, with the existing four-layer maximum of 65 calls.

A minimal independent control makes the scope boundary even clearer. Let G be the three-bit permutation with input-order table [0,1,2,4,3,6,7,5], and define the 32-bit permutation F(x)=(x & 0xfffffff8) | G(x & 7). The three output coordinate ANFs are:
- G0 = x0 XOR x0*x1 XOR x2;
- G1 = x1 XOR x0*x1 XOR x2 XOR x1*x2;
- G2 = x0*x1 XOR x0*x2 XOR x1*x2.

The three quadratic coefficient vectors are 0x7, 0x4, and 0x6, linearly independent. Thus all seven nonzero output parities of G have degree 2, and the embedded F is a 32-bit degree-two permutation with no nonconstant affine output parity on its final three-bit coset. For secret 0x9a123457 and target 0x9a123455, the local port refuses at dimension 3 after 2,361 calls; the remaining coset is base 0x9a123450 plus span{1,2,4}. This is a small S-box scope control, not a security candidate.

A local optional fallback that enumerates the residual coset after flag refusal recovered the embedded S-box target in 2,362 calls (one extra point; the D=2 coefficient frame already queried 7/8) and the four-layer seed-0 target in 695,873 calls (zero extra points because D=5 had already sampled all eight residual inputs). A configurable small residual-dimension fallback can therefore turn these refusals into exact inversions, but it has no polynomial worst-case guarantee if the residual dimension remains large.

Interpretation: the bounded-degree affine-flag algorithm often succeeds on this layered family because many residual cosets happen to have flags, but it is not a generic low-degree permutation inverter. The stated two-sided triangular-affine promise remains important. The existing rank-sum attack is both more general for this particular family and dramatically cheaper. These checks do not challenge the rank-sum theorem or establish a positive obfuscation result.
