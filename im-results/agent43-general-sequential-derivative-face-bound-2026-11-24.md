# General sequential derivative-face query bound over GF(2)

**Date:** 2026-11-24  
**Status:** intermediate mathematical derivation; not a validated implementation or a production security claim.

## Model and assumptions

Let (F:V\to W), (V=\mathbb F_2^n), be a fixed deterministic vector-valued Boolean polynomial of degree at most (d). Let (B=\Delta_{v_1}\cdots\Delta_{v_d}F(0)) be its constant top finite-difference form. Assume (B) is nonzero and its joint radical has codimension exactly (d), so the quotient (Q=V/R) has dimension (d) and the induced (d)-form is a nonzero volume form.

The result concerns query cost for finding a nonzero (d)-direction witness, recovering quotient coordinates from contractions, constructing a section table, and validating a degree-at-most-(d) candidate with independent uniform postfit samples.

## Sequential (d+1)-direction witness search

Draw (d+1) independent uniform directions. For each omitted index (j), evaluate the (d)-th derivative on the (d)-tuple consisting of all directions except (j). Evaluate these (d)-faces sequentially and stop at the first nonzero derivative.

The (d+1) projected directions span (Q) with probability

\[
p_{d+1}=\prod_{i=0}^{d-1}(1-2^{i-(d+1)}).
\]

If they span (Q), their unique nonzero dependency vector is uniform among the (2^{d+1}-1) nonzero vectors of (mathbb F_2^{d+1}). The first nonzero dependency coordinate is at position (j) with probability (2^{d-j}/(2^{d+1}-1)). After checking faces (0,\ldots,j), the union of queried cube vertices has size (2^{d+1}-2^{d-j}). Therefore the expected number of vertices in the successful trial, conditional on spanning (Q), is

\[
E_{\mathrm{success}}
=\frac{1}{2^{d+1}-1}\sum_{j=0}^{d}2^{d-j}(2^{d+1}-2^{d-j})
=\frac{2^{d+2}-1}{3}.
\]

The union of all (d+1) faces excludes only the all-ones vertex, so a failed trial costs at most (C_d=2^{d+1}-1) vertices. The zero input is shared across trials. Assuming no other subset-sum collisions, the expected unique witness-query count until success is

\[
E_{\mathrm{witness}}
=\frac{2^{d+2}-1}{3}+(2^{d+1}-2)\frac{1-p_{d+1}}{p_{d+1}}.
\]

Additional collisions in the original input space can only reduce the number of distinct oracle queries.

For a failure probability target (delta), the number of trials needed to make witness miss probability at most (delta) is

\[
T_d=\left\lceil\frac{\ln\delta}{\ln(1-p_{d+1})}\right\rceil.
\]

The worst-case witness-query cap over (T_d) trials is (C_d+(C_d-1)(T_d-1)).

## Quotient signatures, section table, and verifier

After a successful witness, its (d)-face already contains all (2^d) section-table inputs. For each of the (n) standard basis vectors, the (d) coordinate contractions use (d) derivative faces. Their anchor-only subsets are cached in the section table; at most (2^d-1) new points containing the standard basis vector are needed. Thus the signature-query cap is ((2^d-1)n).

For any incorrect degree-at-most-(d) candidate, the nonzero difference is a nonzero Reed–Muller (RM(d,n)) word with relative weight at least (2^{-d}). Independent uniform verifier samples therefore give false-accept probability at most ((1-2^{-d})^m), requiring

\[
m_d=\left\lceil\frac{\ln\delta}{\ln(1-2^{-d})}\right\rceil.
\]

The resulting fast-path cap is

\[
Q_d=C_d+(C_d-1)(T_d-1)+(2^d-1)n+m_d.
\]

This cap applies only when the fast path succeeds. Exact ANF fallback requires up to (sum_{k=0}^{d}\binom{n}{k}) interpolation inputs, plus any cached fast-path/verifier inputs not already in that set. The false-accept guarantee requires a fixed degree-at-most-(d) oracle and verifier draws independent of witness/training draws.

## Numerical illustration

For (n=32), (delta=10^{-10}), the formula gives:

| Degree (d) | Witness probability (p_{d+1}) | Trial cap (T_d) | Expected unique witness queries | Signature cap | Verifier samples | Fast-path cap |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.750000 | 17 | 3.00 | 32 | 34 | 101 |
| 2 | 0.656250 | 22 | 8.14 | 96 | 81 | 310 |
| 3 | 0.615234 | 25 | 19.09 | 224 | 173 | 748 |
| 4 | 0.596008 | 26 | 41.33 | 480 | 357 | 1,618 |
| 5 | 0.586696 | 27 | 86.01 | 992 | 726 | 3,393 |
| 6 | 0.582112 | 27 | 175.45 | 2,016 | 1,463 | 6,882 |
| 7 | 0.579838 | 27 | 354.39 | 4,064 | 2,936 | 13,859 |
| 8 | 0.578706 | 27 | 712.28 | 8,160 | 5,884 | 27,815 |
| 9 | 0.578141 | 27 | 1,428.07 | 16,352 | 11,778 | 55,725 |
| 10 | 0.577858 | 27 | 2,859.66 | 32,736 | 23,567 | 111,546 |

For (d=5), the witness expectation is 86.0099 and the cap is (63+62(27-1)+31\cdot32+726=3393), matching the lazy-face refinement of the rank-five hybrid. The current checked-in implementation remains eager and uses its separately validated 3420 cap.

## Scope

This is a query-accounting derivation under the stated algebraic promise. It does not establish global optimality of (d+1) directions among all adaptive strategies, correctness for arbitrary JavaScript, or compliance with the project's 2.5x runtime budget. The numerical table is formula-derived and should be independently implemented/tested before promotion to established results.


## Small-degree exhaustive cross-check

A separate local enumerator exhausted every (d\times(d+1)) binary direction matrix for (d=1,2,3,4), checked the faces in lexicographic order, and counted the union of face vertices at the first nonzero derivative. It matched both the theoretical span probability and the conditional successful-trial mean exactly:

| (d) | Matrices exhausted | Empirical / theoretical (p_{d+1}) | Empirical / theoretical (E_{\mathrm{success}}) |
|---:|---:|---:|---:|
| 1 | 4 | 0.75 / 0.75 | 2.333333 / 2.333333 |
| 2 | 64 | 0.65625 / 0.65625 | 5 / 5 |
| 3 | 4,096 | 0.615234375 / 0.615234375 | 10.333333 / 10.333333 |
| 4 | 1,048,576 | 0.59600830078125 / 0.59600830078125 | 21 / 21 |

This is an independent local computational cross-check, not a repository CI result. The closed-form proof remains the basis of the claim.
