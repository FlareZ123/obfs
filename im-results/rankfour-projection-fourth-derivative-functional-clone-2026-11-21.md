# Rank-four projected arbitrary vector function: full oracle clone by fourth polarization with cubic fallback

**Agent 22, 21 November 2026. Intermediate chosen-oracle cryptanalysis.**
This generalizes the independently reviewed
[rank-three projected full clone](rankthree-projection-third-derivative-functional-clone-2026-11-21.md)
to rank-four hidden input projections. Academic novelty has not been
established. The formulas below are mathematical upper bounds
conditional on the stated source-family promise.

## Promise and upper bounds

A hidden fixed function on GF(2)^n, 4<=n<=32, is promised to satisfy

\[
F(x)=b\oplus Ax\oplus Ug(Vx)
\]

for an unknown linear input projection V of rank at most **four**,
arbitrary vector-valued g, arbitrary A and U, and fixed b.
A and F may be singular and noninjective. The attacker has only
unlimited legitimate chosen-input calls to the **fixed** function F,
knows the bit width and rank promise, and has no access to the
source, hidden projection, coefficients, or oracle internals.

Let

\[
p_4=\frac{315}{1024},\qquad
t_4=\left\lceil\frac{\ln\delta}{\ln(1-p_4)}\right\rceil,
\]
and, for a quartic-free source,
\[
p_3=\frac{21}{64},\qquad
t_3=\left\lceil\frac{\ln\delta}{\ln(1-p_3)}\right\rceil.
\]

The integrated randomized full-function clone succeeds with
probability at least \(1-\delta\) and needs at most

\[
Q\le\max\left(
n+1+15t_4+14n,\quad
15t_4+7t_3+6n+8+\sum_{j=0}^{2}\binom nj
\right)
\]

distinct chosen forward calls. The first term is the genuine
quartic path. The second is the quartic-free cubic-rescue path:
the quartic stage and cubic stage both query \(F(0)\) and
all \(F(e_i)\), so the shared \(n+1\) basis values are
subtracted once. These are mutually exclusive source classes
for a fixed F; the failure probability is bounded by
\(\max((1-p_4)^{t_4},(1-p_3)^{t_3})\), not their sum.
With n=32 and delta=10^-10, t4=63 and t3=58; the two miss
probabilities are approximately **8.746122346045706e-11**
and **9.610189081665655e-11**, respectively:

| Branch | Maximum distinct oracle evaluations |
| --- | ---: |
| Genuine quartic coefficient detected | **1,426** |
| Quartic absent, cubic tensor rescue plus quadratic residual | **2,080** |
| Unrestricted degree-four generic ANF (different, broader class) | 41,449 |

Once learned, either model reproduces the **entire** function offline
with no more oracle queries. This measures attacker value-query
complexity, not protected program execution time or original source
text recovery.

## Constructive proof

The algebraic normal form of any function on at most four input
bits has degree at most four. Choose a basis for the unknown
four-dimensional image of V if necessary and write the unique top
degree term as a fixed output vector
\(w z_1 z_2 z_3 z_4\). The remaining terms have degree <=3.

Define the fourth mixed finite difference of the public F:

\[
T_4(a,b,c,d)=
\bigoplus_{S\subseteq\{a,b,c,d\}}
F\left(\bigoplus_{v\in S} v\right).
\]

Every affine, quadratic and cubic term cancels. The top multilinear
term leaves

\[
T_4(a,b,c,d)=w\,\det(Va,Vb,Vc,Vd).
\]

In GF(2), the determinant equals the permanent because signs
disappear; this identity follows by expanding the 16 subset
values and keeping precisely terms using each of the four
differences once.

If w is nonzero, rank(V)=4 and four independent uniform input
vectors project to four independent uniform four-bit vectors.
An ordered projected quadruple is independent with probability
\((15/16)(14/16)(12/16)(8/16)=315/1024\).
The probability that t independent quadruples fail to expose w
is exactly \((1-315/1024)^t\). Every T4 evaluation uses at
most fifteen new chosen queries once F(0) is cached.

Suppose a quadruple of anchors a1,a2,a3,a4 yields
T4(a1,a2,a3,a4)=w !=0. Their hidden projected vectors form a
basis. For any input x, its four dual coordinate bits are recovered
from

\[
p_i(x) =
[T_4(a_1,\ldots,a_{i-1},x,a_{i+1},\ldots,a_4)=w].
\]

Each expression is exactly zero or w by multilinearity.
To recover all p_i(e_j), query the fourth differences after
replacing each of the four anchors in turn with each standard
input basis vector e_j. All required evaluations are among
F(e_j XOR sum_{i in S} a_i) for **proper subsets** S of the
four anchor positions. F(e_j) is already known from the initial
n+1 affine-basis queries, and the union of required nonempty
proper subsets contains at most 2^4-2=14 per e_j.
Therefore at most 14n additional unique calls recover every
dual coordinate map.

The successful T4 already evaluated all 16 anchor-cube
vertices. A four-variable Boolean Möbius transform of these
values yields the entire vector ANF in the newly recovered
projected coordinates, including all six quadratic, four
cubic and one quartic coefficient vectors. Keep only the
eleven degree>=2 coefficients in an explicit function H.
The remaining unknown affine component is obtained from the
original basis responses by

\[
c=F(0),\quad
L_j=F(e_j)\oplus c\oplus H(p(e_j)).
\]

Thus for **every** input x,

\[
F(x)=c\oplus\bigoplus_j x_j L_j\oplus H(p(x)).
\]

All coefficients and coordinate maps are learned numeric data.
The resulting clone has no dependency on the server oracle.

If the quartic coefficient is zero (including rank(V)<4),
then F has degree at most three. The integrated fallback
uses the independently tested [rank-four cubic tensor rescue](rankfour-projection-cubic-tensor-rescue-2026-11-21.md).
For a random triple, its third mixed derivative is nonzero
with probability at least \(p_3=21/64\) whenever the
vector-valued cubic component is nonzero on a rank-at-most-four
projection. After finding a witness triple (at most
\(7t_3\) new values), the signature
\(S(x)=(T_3(x,a,b),T_3(x,a,c),T_3(x,b,c))\)
recovers the cubic-support coordinates. The signature kernel
equals the joint radical in the at-most-four-dimensional
quotient; Agent 11 independently reviewed this lemma.
Computing the signatures on all standard basis inputs costs
at most \(6n\) additional values because the three
third-difference cubes share six nonempty anchor subsets.
A three- or four-anchor cube (at most eight additional
values) recovers the homogeneous cubic component. Subtract
that component and interpolate the residual degree-at-most-two
function using \(\sum_{j=0}^{2}\binom nj\) values.

The standalone cubic-rescue cap is
\(7t_3+6n+8+\sum_{j=0}^{2}\binom nj\).
Because the outer quartic phase has already cached
\(F(0),F(e_1),\ldots,F(e_n)\), the integrated union bound
subtracts those shared \(n+1\) values, yielding the second
term in Q. If the quartic coefficient is nonzero but all
quartic probes miss, the cubic fallback need not be correct;
that event is already bounded by the quartic miss probability.
If the quartic coefficient is zero, the cubic miss probability
is bounded by \((1-p_3)^{t_3}\); if both cubic and quartic
terms vanish, the quadratic fallback is exact.

## Independent mathematical and executable checks

A separate explicit Python finite calculation enumerated all
16^4=65,536 ordered input quadruples on GF(2)^4 for the
Boolean quartic \(f(x)=x_0x_1x_2x_3\). For every quadruple
it computed the 16-vertex mixed derivative and a separately
implemented 4x4 GF(2) matrix-rank test. The two answers
agreed in all 65,536 cases. Exactly **20,160** quadruples
had a nonzero fourth derivative: 20,160/65,536 = 315/1024.

The independent [strict-JSDoc CommonJS functional clone and full
verifier](../sims/rankfour-projected-fourth-derivative-oracle-clone.js)
contains its own fourth derivative, sample-response cache,
coordinate recovery, Boolean Möbius interpolation and
JSON-serializable offline evaluator. Its quartic-free path now
calls the [cubic tensor rescue](../sims/rankfour-projected-cubic-rescue.js),
which recovers the homogeneous cubic component and delegates
the residual to the generic quadratic learner. The test
disables the original oracle callback before evaluating all
held-out outputs.

One complete Ubuntu Node22 execution of the new source
reported:

| Source/test class | Verified observations |
| --- | --- |
| Arbitrary four-bit scalar truth tables | **65,536 of 65,536** |
| Fully checked finite outputs | **1,048,576** |
| Quartic-witness branch cases | 32,768 |
| Exact cubic-or-lower fallback cases | 32,768 |
| Independent randomized 32-bit oracle instances | 12 |
| Offline held-out 32-bit outputs | 6,144 |
| Deliberately noninjective 32-bit instances | 4 |
| 32-bit quartic branch instances | 8 |
| 32-bit cubic-or-lower fallback instances | 4 |
| Maximum observed 32-bit quartic calls | 571 |
| Maximum observed 32-bit quartic-free integrated fallback calls | 1,681 |
| Maximum observed 32-bit total calls | 1,681 |
| Incorrect outputs or failed computational assertions | **0** |

The four-bit exhaustive collection uses a fixed identity
input projection, identity affine core, and an arbitrary
one-bit-valued g table; every one of its 16 outputs is checked.
The separate 32-bit collection uses hidden random rank-four
input projections, arbitrary vector-valued 16-entry g tables,
hidden linear cores, and cases designed to be genuinely
noninjective by deleting one affine-core input column and
making all projected inputs independent of that column.
All three possible branches are exercised. The seed is
fixed for reproducibility; it does not certify the
independent-uniform statistical tail.

The implementation was committed at
[82d7eb2](https://github.com/FlareZ123/obfs/commit/82d7eb23458b70eca47b539d6beb4b65238b45ab).
The existing research CI workflow and strict peer JSDoc
configuration were extended in
[9ffdcd0](https://github.com/FlareZ123/obfs/commit/9ffdcd01e97446e5a1ce09dbae693df977a95af8),
without creating a new CI workflow family. The earlier
[run 44960231507](https://github.com/FlareZ123/obfs/actions/runs/44960231507)
passed the initial quartic-only implementation. The integrated
quartic/cubic dispatcher and matched control were subsequently
verified by [run 44973169956](https://github.com/FlareZ123/obfs/actions/runs/44973169956),
source pinned at
`a39ee02a207719ff29cc2194bf39a762cbdf9067`.
Both Ubuntu and Windows jobs passed the rank-four full clone,
quartic-free cubic rescue, matched rank-four control, and
strict project JSDoc/typecheck steps. The integrated source
changes are [05eadbe](https://github.com/FlareZ123/obfs/commit/05eadbe4372b5d3baee025d016dd366a1d3abdf1)
and [a9a3fbf](https://github.com/FlareZ123/obfs/commit/a9a3fbfc2f6ffa2fe6a299ebd649e3b9a75b3d09).
This green status validates the fixed deterministic test
transcripts and implementation on both platforms; it does
not independently certify the theorem's general-uniform
probability guarantee.

## Limits and candidate consequences

The mathematical theorem is conditional on hidden input rank(V)
at most four, fixed F, GF(2) finite-bit numeric functions,
and unlimited legitimate chosen inputs. It does not cover
generic JavaScript effects, code shapes, browser API
semantics, mutation of F between queries, or general
high-dimensional hidden projections. It clones numeric
functionality, and does not recover exact source spelling
or a hidden server secret.

The result weakens a candidate SCO protection theory that
relies on **only four input features** as the hidden source
of nonlinearity: a client with unlimited legitimate calls
can learn the complete function with at most 2,080 values
at the specified confidence, and at most 1,426 when the
top quartic coefficient is actually present and found.
These are attacker capability bounds, not runtime
performance or deployed defense promises. Academic
novelty remains unverified, so this material belongs
in intermediate results; the overall three-mode
strong-obfuscation release remains **RELEASE-BLOCKED**.


## Same-source unrestricted quartic baseline

To test an **identical source function** rather than comparing only
two theoretical learning-class formulas, the independently authored
[matched 32-bit executable](../sims/rankfour-projected-vs-generic-quartic-matched.js)
trains the specialized rank-four projected learner and the existing
unrestricted degree-four ANF full-functional learner on each
of the same **eight** fixed functions. The source set contains
two genuine quartic, two cubic-or-lower, two deliberately
singular and noninjective quartic, and two affine controls.
All use hidden rank-four projected input forms and vector-valued
four-bit lookup tables. Each learner has its own live callback
during training, and the callback is disabled before an
identical set of 128 previously unseen inputs per function
is evaluated offline.

| Metric | Rank-four projected learner | Generic unrestricted quartic |
| --- | ---: | ---: |
| Source functions | 8 | 8 |
| Verified identical held-out outputs per method | 1,024 | 1,024 |
| Minimum chosen evaluations in one source | 496 | 41,449 |
| Maximum chosen evaluations in one source | 1,880 | 41,449 |
| **Total** chosen evaluations | **9,157** | **331,592** |
| Wrong held-out outputs | 0 | 0 |

The specialized learner saves **322,435** chosen oracle
evaluations, or **97.24%** across this particular matched
source set. The generic learner used **36.21 times** as
many chosen evaluations in aggregate. The quartic-free
cubic-rescue cases used 1,688-1,880 calls, below the 2,080
cap; observed quartic cases needed 496-511 calls. For this
source-aware attacker comparison, the price of the broader
unrestricted polynomial source class is directly visible.

The earlier [source-pinned Ubuntu and Windows CI run
44960530618](https://github.com/FlareZ123/obfs/actions/runs/44960530618)
passed the original matched benchmark. The integrated
matched control is now source-pinned by
[run 44973169956](https://github.com/FlareZ123/obfs/actions/runs/44973169956)
at `a39ee02a207719ff29cc2194bf39a762cbdf9067`; both
platforms reported identical results: eight source cases,
1,024 matched held-out outputs per learner, specialized
min/max/total queries 496/1,880/9,157, generic total
331,592, and 322,435 saved queries. This is matched
**chosen-query cost**, and does not evaluate
obfuscator-vs-minifier protection, source reconstruction,
runtime slowdowns, network cost or the required 2.5x
compute ceiling.

The tested result is a negative candidate-selection
criterion. It does not establish academic originality
or a production obfuscation scheme, and remains in
intermediate results.
