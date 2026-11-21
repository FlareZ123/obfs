# Rank-three projected arbitrary vector functions: third-derivative functional clone with quadratic fallback

**Agent 22, 21 November 2026. Intermediate attack-side, source-family-aware theorem and executable test.**
This extends the [rank-two polarization clone](ranktwo-projection-polarization-functional-clone-2026-11-21.md).
Academic novelty remains unverified. It proves an attack on an oracle
family with a small input linear projection, not a deployable obfuscator.

## Promise and result

Let an unknown fixed oracle map GF(2)^n to GF(2)^n with n<=32:

\[
F(x)=b\oplus Ax\oplus Ug(Vx).
\]

Here V is an unknown fixed input linear map of rank at most **three**,
g is an arbitrary function, A and U are arbitrary fixed linear maps
of any rank, and b is fixed. Neither F nor A is required to be
injective or invertible. An attacker receives only legitimate chosen-input
oracle evaluations and knows the rank promise, not any coefficients.

For any failure tolerance delta in (0,1), a randomized attacker can
recover a complete offline evaluator, correct for **every input**
simultaneously with probability at least 1-delta, using at most

\[
t=\left\lceil\frac{\ln\delta}{\ln(43/64)}\right\rceil
\]

independent uniformly random input triples and at most

\[
Q\le
n+1+7t+
\max\left(6n,{n\choose2}\right)
\]

distinct chosen-oracle evaluations. The two branches reflect a
nonzero cubic coefficient versus exact quadratic fallback. At n=32,
delta=10^-10, t=58 with (43/64)^58 around
9.610189081665655e-11, the cubic branch needs at most **631** values,
and the worst-case quadratic fallback at most **935**. The clone
then evaluates unlimited future inputs with **zero additional live
oracle calls**. This number measures attacker oracle access, not
original/obfuscated program compute or compatibility.

## Constructive derivation

Every vector-valued function on three Boolean input coordinates
has a unique algebraic normal form through degree three. Therefore
F has degree at most three even after the hidden linear projection.

Define the public alternating second and third finite differences,
with addition and subtraction equal to XOR:

\[
B(a,b)=F(0)\oplus F(a)\oplus F(b)\oplus F(a\oplus b),
\]

\[
T(a,b,c)=\bigoplus_{S\subseteq\{a,b,c\}}
F\left(\bigoplus_{s\in S}s\right).
\]

All affine and quadratic terms vanish from T. Let w be the cubic ANF
coefficient of the hidden projected three-bit function; then

\[
T(a,b,c)=w\det(Va,Vb,Vc)
\]

after choosing an arbitrary basis for the rank-three projection.
For independent uniform a,b,c, their projected vectors are
independent uniform elements of GF(2)^3. Exactly
(7/8)(6/8)(4/8) = **21/64** of these triples span the three-dimensional
space. If w is nonzero, each triple independently returns w with
probability 21/64. After t misses the probability of a truly
nonzero cubic coefficient going undetected is (43/64)^t.
Each triple uses at most seven new oracle calls once F(0) is cached.

### Cubic found

Suppose a,b,c satisfy T(a,b,c)=w != 0. Their projected coordinates
form a basis. The three unknown scalar linear maps of any input x
relative to this basis can now be learned from the public third
finite differences:

\[
p(x)=[T(x,b,c)=w],\quad
q(x)=[T(a,x,c)=w],\quad
r(x)=[T(a,b,x)=w],
\]

where the bracket denotes a Boolean indicator. All three differences
must be either zero or w. Querying them on each standard input
basis vector e_i determines p_i,q_i,r_i. Across the three expressions,
six distinct translations of e_i by a,b,c or their pairwise XORs
suffice because the other cube vertices are already known.
Thus this step costs at most **6n** additional values.

The nonlinear ANF coefficient vectors in these newly discovered
coordinates are obtained from the previously known anchor-cube
values:

\[
h_{12}=B(a,b),\quad h_{13}=B(a,c),\quad
h_{23}=B(b,c),\quad h_{123}=T(a,b,c)=w.
\]

Define the explicit nonlinear function

\[
H(p,q,r)=h_{12}pq\oplus h_{13}pr\oplus
h_{23}qr\oplus h_{123}pqr.
\]

From the initial n+1 affine basis queries,
compute c_0=F(0) and each corrected linear column

\[
L_i=F(e_i)\oplus c_0\oplus H(p_i,q_i,r_i).
\]

For every x, exactly

\[
F(x)=c_0\oplus\bigoplus_i x_i L_i
\oplus H(p(x),q(x),r(x)).
\]

This is the **complete** function, with no additional server
calls. The proof does not use an inverse of A, V, U or F.

### No cubic witnessed

If w=0 or rank(V)<3, the composition has degree at most two
in its original n input bits. Generic Boolean quadratic ANF
interpolation queries F(0), each F(e_i) and each
F(e_i XOR e_j), yielding all c_0, linear and quadratic coefficient
vectors exactly. This costs n+1+C(n,2) chosen values, with possible
reuse of the earlier triple samples. The resulting offline model
is exact for every input.

If w is actually nonzero but all t random triples were degenerate,
the algorithm mistakenly takes this quadratic branch; this is the
*only* correctness-failure event under the stated structural promise
and has probability at most (43/64)^t.

## Independent executable validation

The [self-contained JSDoc CommonJS implementation](../sims/rankthree-polarization-oracle-clone.js)
keeps the attack callback and the source-only generator separate.
Its output is a JSON-serializable learned model whose evaluator
contains no reference to the oracle. The test disables the
oracle before every held-out evaluation.

One local Node 22.16.0, fixed-seed execution showed:

| Observation | Result |
| --- | ---: |
| Complete 3-bit invertible projection matrices V | 168 |
| Arbitrary one-bit-valued g truth tables per projection | 256 |
| Three-bit source parameter representations checked | 43,008 |
| Exact outputs exhausted across those representations | 344,064 |
| Three-bit cubic branch cases | 21,504 |
| Three-bit exact-quadratic branch cases | 21,504 |
| Independently generated 32-bit functions | 64 |
| Offline held-out 32-bit outputs | 262,144 |
| 32-bit cubic branch cases | 36 |
| 32-bit quadratic branch cases | 28 |
| Deliberately noninjective 32-bit sources | 16 |
| Maximum observed chosen query count | 935 |
| Maximum triple trials observed | 58 |
| Wrong offline outputs or failed executable assertions | 0 |

The small-width family checks every Boolean g on three input bits
and every invertible 3x3 hidden input projection, with an identity
affine core and a nonzero output vector. The 32-bit sources include
independent random rank-three projections, arbitrary eight-entry
vector-valued g tables, random invertible affine cores and
deliberately noninjective affine-wrapped functions. The attacker is
never given the private truth-table entries or projection maps.

The fixed-seed transcript establishes finite computational
reproducibility of the reconstruction formulas. The stated
sampling failure probability follows from independent-uniform
draws, rather than being directly measured from this deterministic
seed. An actual deployment of the mathematical learner would need
an appropriate independent uniform input sampler.

## Comparison and applicability

A generic degree-three GF(2)^32 oracle is fully learnable from
1+32+C(32,2)+C(32,3) = **5,489** ANF values. The present
**935** high-confidence upper bound is a specialized source-family
attack conditional on rank(V)<=3. It does not invalidate the
unrestricted class's dimensional lower bounds. It also has
different goals and assumptions from the earlier **118-query**
rank-two one-target inversion and **244-query** rank-two
full-function clone.

For the project objective, the result is **negative evidence against
small hidden input projection rank** as a chosen-oracle cloning
barrier in SCO. It does not by itself expose private server code,
prove unauthorized access, defeat all JavaScript obfuscation
constructions, improve the obfuscator implementation, or verify
the project's 2.5x compute ceiling. The overall protective
release verdict stays **RELEASE-BLOCKED** until candidate-specific
security and performance comparisons pass.
