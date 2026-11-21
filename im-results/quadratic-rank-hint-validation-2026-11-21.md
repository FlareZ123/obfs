# Auditing false low-rank promises in quadratic black-box cloning

**Agent:** 41  
**Date:** 21 November 2026  
**Status:** intermediate mathematical adversarial safety finding and bounded-risk repair.  
**Reproducer:** [sims/quadratic-rank-validated-offline.js](../sims/quadratic-rank-validated-offline.js), [prior full-rank boundary census](../sims/rankthree-uniform-gl4-peer.js), [quadratic interpolator](../sims/rankthree-quadratic-bilinear-shortcut.js).

## Precise weakness in the earlier early-rank certificate

The earlier quadratic learner correctly assumes that the input projection rank \(\operatorname{rank}(V)\le r\) is a **true source-class promise**, not something inferred from observing a few nonzero polarizations. If \(F\) has second-polar radical codimension greater than the supplied \(r\), the partial signature map can reach rank \(r\) and create a plausible early clone before discovering a fourth independent direction. Some invalid-promised functions then produce an incorrect clone without throwing.

An independent exact census enumerated all \(4^6=4,096\) choices of six 2-bit vector quadratic coefficients on four input variables. There are **736** functions whose full polarization signature has rank at most three and **3,360** with rank four. Before validation:

| Source population | Outcome with falsely presumed rank cap 3 |
| --- | ---: |
| Actual polarization rank at most 3 | 736 correctly modeled; 11,776 exhaustive output values matched |
| Actual rank 4; outright detected promise violation | 1,488 |
| Actual rank 4; early model returned silently wrong values | **1,872** |

The 1,872 silent mismatches are outside the theorem's promised class. They demonstrate why a source-hinted rank ceiling must not be interpreted as a verified discovery about an arbitrary JavaScript function.

To make this contractual distinction explicit, the optimized solver now **requires a rank upper bound argument** instead of defaulting to three; passing \`null\` deliberately selects full generic degree-two ANF interpolation without early rank guesses.

## Postfit randomized validation theorem

Let \(F,\widehat F:\mathbb F_2^n\to\mathbb F_2^m\) both have coordinatewise algebraic degree at most two. If \(F\ne\widehat F\), their vector difference \(D=F+\widehat F\) has at least one nonzero Boolean coordinate polynomial of degree \(d\le2\).

A nonzero Boolean polynomial of degree at most \(d\) evaluates to one on at least \(2^{n-d}\) inputs. One elementary proof chooses a highest-degree monomial, fixes the remaining \(n-d\) variables arbitrarily, and observes that the restriction to its \(d\) monomial variables retains the unique top-degree monomial; it is not the zero function, so has at least one nonzero value among \(2^d\) assignments. Consequently the two distinct quadratic vector functions disagree on at least one quarter of the domain, provided \(n\ge2\).

After fitting \(\widehat F\), draw \(t\) *independent uniform* full-width input points, call the original oracle and compare. Conditional on the fitted model, if it is wrong, all \(t\) tests miss its error set with probability at most
\[
(3/4)^t.
\]
For \(t=81\), \((3/4)^{81}=7.58511788349506\cdot10^{-11}\), below \(10^{-10}\). Sampling must occur after the model is fixed, using independent randomness the prospective source cannot adapt to. In the 32-bit tests, Node's CSPRNG supplies \`randomBytes(4).readUInt32BE(0)\`. Deterministically seeded or adversarial challenge points **do not** establish this probability bound.

The new wrapper caches legitimate oracle responses. It first constructs the rank-hinted exact-when-promised model. If the interpolator explicitly detects a false rank promise, it immediately completes generic quadratic ANF. If an early model is produced, it makes up to 81 validation oracle calls. A mismatch triggers the same generic exact ANF using all cached samples. The final model is therefore either exactly reconstructed using the low-rank proof, generically exact after fallback, or a wrong quadratic that passed all challenges with risk bounded as above.

This minimum-weight fact is a classical Reed–Muller code theorem, not a novelty claim. A textbook reference states that \(\mathrm{RM}(2,m,r)\) has minimum distance \(2^{m-r}\): [Introduction to Coding Theory, Theorem 6.3.3](https://cse.buffalo.edu/faculty/atri/courses/coding-theory/book/ada-coding-book.pdf). The special case \(r=2\) supplies the one-quarter disagreement floor.\n\nA worst-case distinct-value upper bound at \(n=32\) is \(529+81=610\). This is a query budget, not CPU budget, and it requires the degree-at-most-two promise. If the function is cubic or otherwise outside that degree class, the Reed-Muller distance bound and 529-query fallback cease to be correct. No claim about arbitrary-JavaScript learning follows.

## Reproduction

The second, validated test reuses the same 4,096 coefficient families. For width four, it sets validation to cover **all 16 possible inputs**, so correctness is unconditional in this exhaustive finite-domain verifier, even for an incorrect rank hint.

| Full width-four census | Observed |
| --- | ---: |
| Actual polar rank ≤3 | 736 |
| Actual polar rank 4 | 3,360 |
| Rank 4 rejected directly | 1,483 |
| Rank 4 caught by exhaustive output validation | 1,877 |
| Incorrect final clones | **0** |
| Post-training exact heldout values | **65,536 / 65,536** |
| Maximum distinct queries | **16** |
| Mean distinct queries across all 4,096 | **14.29345703125** |

The direct-rejection versus validation split differs from the earlier census because the validation wrapper chooses a hashed, invertible **input basis**, while the first census uses the ordinary fixed basis. Both account for all 3,360 false-cap cases. The final exact 16-domain output check occurs only after disabling the source oracle for the reconstructed model.

For 32-bit controls, the same hash-coordinate seed is used with the candidate rank cap three and a fresh set of 81 CSPRNG validation values:

- **True rank-three late-support quadratic:** 94 fitting calls plus 81 distinct validation queries, **175 total**, exact on 4,096 heldouts after source access is disabled. The rank-hinted model passes.
- **False rank-three hint on a rank-eight-input quadratic:** the candidate is rejected by validation (one local sample caught it after two challenges), generic exact ANF completes, and **597 total distinct calls** were measured, with 4,096/4,096 post-training outputs exact. The number of challenges before detection is random and not a guarantee of two.
  
The 32-bit tests are concrete seeded/CSPRNG observations, while the mathematical \((3/4)^{81}\) bound applies to independent uniform challenges. They are complementary types of evidence.

## Source-pinned Linux and Windows verification

The existing [low-rank two-platform workflow 44961792517](https://github.com/FlareZ123/obfs/actions/runs/44961792517) completed **successfully** at immutable source `c9632ac38d5dbca887ad657dbf66edcdada88018`, including the new validated learner, false-promise exhaustive census, existing attack peers and strict JSDoc. The two OS logs agree on all exhaustive controls and the true-rank-three 175-query result. The false-rank-three test exhibits expected challenge randomness: **Ubuntu rejected after two validation challenges and consumed 597 distinct calls; Windows rejected after one challenge and consumed 596 calls**. Both then completed generic ANF and passed their 4,096 post-training heldout checks. No deterministic equality of those CSPRNG draws was assumed.

## Security and compatibility limits

This repair reduces the danger of silently treating an *unknown rank* as a true rank promise in a degree-two attack-side learner. It does not prove a source is quadratic, protect against dynamically changing legitimate oracle output, or authorize collection of 610 requests from a production service. The underlying oracle access remains the approved user’s valid SCO RPC credential. It is a research improvement in **black-box attack correctness**, not an obfuscator security improvement or source-code reconstruction.

The same validation technique is available to a conventional minified private API. The project's COO/SNO/SCO release decision remains **RELEASE-BLOCKED**. Independent reproduction and bibliographic novelty assessment remain separate from correctness of the finite-domain and proof exercises.
