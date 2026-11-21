# Exact chosen-query cloning of bounded-degree 32-bit functions through degree four

**Date:** 21 November 2026. **Agent 50. Status:** intermediate negative candidate-elimination evidence. This report applies the established Boolean ANF/Möbius interpolation identity and makes no academic novelty claim. The value is a source-pinned, independently generated, high-output-rank 32-bit reproducibility control relevant to proposed low-degree obfuscation.

## Exact theorem

Let `F:GF(2)^n -> GF(2)^m` be deterministic and each coordinate have **global Boolean algebraic degree at most t**, with `0<=t<=n`. Its algebraic normal form is

`F(x) = xor_{S subseteq supp(x), |S|<=t} c_S`,

where each coefficient `c_S` is an `m`-bit output vector. These coefficients can be learned from the outputs at exactly the `Q(n,t)` input bitmasks with Hamming weight at most `t`, where

`Q(n,t)=sum_{k=0}^t binom(n,k)`.

Indeed, for each such mask `S`, Boolean Möbius inversion gives

`c_S = xor_{T subseteq S} F(1_T)`,

or equivalently `c_S=F(1_S) xor xor_{T proper subset S} c_T`. The attacker collects those outputs once, computes all coefficients in increasing subset size, and then reconstructs `F(x)` for **every input x**. After training, no further original-oracle calls are necessary. This applies to non-bijective functions, to every output bit simultaneously, and to arbitrary invertible affine input/output wrappers, which preserve the global maximum ANF degree.

The exact public chosen-query upper bounds for **32 input bits** are:

| Maximal global ANF degree t | Chosen public inputs | Fraction of full 2^32 domain |
| ---: | ---: | ---: |
| 1 | 33 | 0.000000768% |
| 2 | **529** | 0.000012316% |
| 3 | **5,489** | 0.0001278% |
| 4 | **41,449** | 0.000965% |
| 5 | 242,825 | 0.00565% |

These are upper bounds for a specific universal interpolation schedule. They do not claim information-theoretic optimality among all query procedures when a narrower function family is known. The main tested program explicitly supports `t=1..4`, since degree five was not part of the validated evaluation.

The **global degree promise** is essential. A function may match every low-weight training answer while differencing on unqueried high-weight inputs. Exact equivalence follows from the proven degree bound, not from finite sample agreement alone. Stateless behavior and a fixed oracle over the collection period are likewise necessary.

## Full-output-rank 32-bit experimental functions

Two independently generated families use a true 32-bit permutation with **no affine scalar output components**, constructed from a 9-bit quadratic field-cube permutation `z->z^3` on `GF(2^9)` and 23 independent quadratic high-output forms. One family additionally XORs a nonzero cubic monomial of the nine control variables into an upper output bit; the other also XORs a nonzero quartic monomial into a different upper bit. The high bits remain recoverable after the low field-cube permutation is inverted, so the base functions remain bijective. Independent random invertible 32-bit input and output linear maps and an output translation conceal the direct triangular form while maintaining degree `3` or `4`.

The tests do not rely on a 32-bit truth table. They verify the field-cube construction and directly use the source code to establish the global degree bound. From each reconstructed coefficient model, the checker asserts there is a nonzero degree-t coefficient and independently computes **output nonlinear coefficient rank 32** from all degree-two-and-higher coefficient vectors.

## Reproducing the evidence

- [`sims/bounded-degree-oracle-functional-clone.js`](../sims/bounded-degree-oracle-functional-clone.js) is a standalone Node.js CommonJS/JSDoc learner. It enumerates low-weight masks without allocating a 2^32-element array, uses Möbius inversion to produce JSON-serializable coefficient pairs, and exports a pure evaluator with no reference to the original oracle.
- [`sims/bounded-degree-functional-clone-peer-check.js`](../sims/bounded-degree-functional-clone-peer-check.js) uses separately seeded affine wrappers and degree-three/degree-four source generators. It learns two distinct 32-bit cubic instances using **5,489 actual simulated server queries each**, freezes further server access, and verifies **512/512** independently seeded held-out outputs from the serialized model. It similarly learns two quartic instances with **41,449 server queries each**, verifies **256/256** held-out outputs, and confirms all coefficient-rank and degree checks. Both rank classes have full nonlinear output rank32.
- A negative **degree-four transcript spoof** swaps two input addresses of Hamming weight five in an eight-bit identity permutation. Both functions return exactly the same **163** training answers on every mask of weight≤4; the reconstructed coefficient models are byte-for-byte equal, but the swapped non-degree-four permutation differs on two held-out inputs. The script checks both equal models and exactly **2/256** true output discrepancies.
- The dedicated [strict JSDoc gate](../jsconfig.quadratic-radical.json) includes the general learner, its independent randomized stress test, and the earlier quadratic exact-functional-clone and radical tests.

**Immutable, cross-platform evidence:** [manual GitHub Actions run 44937930776](https://github.com/FlareZ123/obfs/actions/runs/44937930776), exact source SHA `4d558f83cf811c7510abb1d989ab97b28d3e2b2e`, completed with **both Ubuntu and Windows jobs passing**. The new cubic/quartic source verification, independent quadratic 529-query clone, 322,560 exact width-three outputs, high-rank 32-bit control cases, strict JSDoc and existing low-rank regressions passed. Raw deterministic seed, case counts and outputs are preserved in the script and CI logs.

## Security and interpretation boundaries

This is a **known Boolean interpolation attack** against low-degree stateless oracle functions. The entire input/output mapping is mathematically reproduced under the degree promise. It does not reconstruct source structure, recover hidden implementation secrets, give an inverse in polynomial local CPU time, defeat stateful server authorization or cross-account isolation, bypass per-account query throttles, or prove anything about general high-degree JavaScript, DOM APIs, dynamic reflection and callbacks. An adversary with unlimited legitimate requests to a fixed exposed low-degree function can apply it; if the function mutates, the coefficients need retraining.

One must independently measure protected-code compute overhead and compare source-matched ordinary minification controls. These attacks neither constitute a working strong obfuscator nor relax the 2.5× protected runtime constraint.

**Operational recommendation:** fixed-width obfuscation permutations advertised as complex because they achieve maximal nonlinear output rank or have many affine wraps should also be screened for **global algebraic degree**. Low-degree examples are exactly reconstructible from the query counts above. This note remains in `im-results/`; the project's strong SCO/COO/SNO release decision remains **RELEASE-BLOCKED**.
