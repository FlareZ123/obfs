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
Q\le n+1+7t+6n=7n+1+7t
\]

distinct chosen-oracle evaluations. The two branches are
a nonzero cubic coefficient with at most 6n extra finite-difference
values and a cubic-free quadratic fallback with at most 2n
additional Gram-signature values. The quadratic branch reuses
polar pairs already contained in the t cubic-probe samples.
At n=32, delta=10^-10, t=58, the cubic branch needs at most
**631** values and the quadratic branch at most **503**.
The exact cubic-witness miss probability is (43/64)^58,
approximately 9.610189081665655e-11. The clone then
evaluates unlimited future inputs with **zero additional live
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

If w=0 or rank(V)<3, F is at most quadratic. Its vector-valued
second difference B is then a true alternating bilinear map whose
joint radical K has codimension at most three. By Agent 11's
independently verified two-anchor Gram criterion, a single
B(a,b)!=0 witnesses a two- or three-dimensional effective
quotient and is enough to reconstruct the entire B. Define
S(x)=(B(x,a),B(x,b)). The signatures of a and b are independent
because S(a)=(0,w2), S(b)=(w2,0), w2=B(a,b)!=0. The map S has
kernel exactly K: otherwise a vector orthogonal to a,b but
outside span(a,b)+K would, together with a and b, span the
entire quotient of dimension at most three and be orthogonal
to itself and that whole quotient, contradicting its
nonmembership in K.

Compute S(e_i) from at most 2n additional oracle values.
If its image rank is three, choose c among the original e_i
whose signature is independent of S(a),S(b).
Express every S(e_i) in the known signature basis and
reconstruct every B(e_i,e_j) by bilinearity from the known
Gram values B(a,b), B(a,c), B(b,c), all previously observed.
If the signature rank is two, a,b already suffice. From
these polar coefficients and the original n+1 affine-basis
values, the exact quadratic ANF is available offline.
The code reuses the independent [rank-three quadratic
Gram peer](../sims/rankthree-quadratic-polarization-peer.js)
and serializes its result into the original self-contained
quadratic model.

No new random-pair search is needed. Every cubic trial
T(a,b,c) has already evaluated F at the eight cube vertices.
Consequently B(a,b), B(a,c) and B(b,c) use **zero new**
oracle calls. Preserve the first nonzero one across all
t independent uniform triples.

To bound the probability of missing every quadratic pair,
choose a nonzero scalar output projection of the
vector-valued B. Its nonzero alternating form has rank
exactly two on an effective quotient of dimension at
most three. Three independently uniform projected vectors
give three pairwise zero determinants in exactly 22 of
64 possible ordered triples (three two-point lines of
GF(2)^2, with the zero triple counted once).
Therefore, for a truly nonaffine quadratic F, the chance
that all t batches contain no nonzero B pair is at most
(11/32)^t. If F is affine, returning the affine interpolation
is exact regardless of the sample transcript.

The cubic-miss and quadratic-miss events are **mutually
exclusive for a fixed source F**: if the true cubic
coefficient is nonzero, any failure is already included
in its (43/64)^t miss event; if it is zero, only the
quadratic B witness can be missed, with failure
at most (11/32)^t. Since 11/32 is smaller than 43/64,
the overall confidence bound is (43/64)^t, and no
separate failure allocation or extra pair sampling is needed.

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
| Maximum observed chosen query count | 503 |
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
**631** high-confidence upper bound is a specialized source-family
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


## Source-pinned two-platform verification

The independent third-derivative source was committed as
[cd54928](https://github.com/FlareZ123/obfs/commit/cd5492832cd29985aa960a2b8d18a2a247dbd20d).
The existing research workflow and strict peer JSDoc project were extended
at [b29660d](https://github.com/FlareZ123/obfs/commit/b29660dc9604be00d4050d645829f64f38c3dbfc).

[GitHub Actions run 44958672983](https://github.com/FlareZ123/obfs/actions/runs/44958672983)
at immutable source
7c4037e305822a62c70af5c4f93c28b3d9ceb9fe **passed both
Ubuntu and Windows Node 22.23.4 jobs**. Each job passed the added
rank-three full-functional clone, all four earlier Agent 22 peer witnesses,
the existing bounded-degree/low-rank research steps, the independent
peer strict JSDoc gate, the quadratic JSDoc gate, and the project
typecheck. The width-three full-domain counts and 32-bit held-out
offline checksum assertions are checked by the executable on this
source pin. The independent proof's uniform-random tail and possible
novelty relative to existing finite-difference oracle literature
are separate, unverified obligations.

No new workflow family was introduced. This does not update the main
obfuscation release decision.


### Quadratic-peer integration and improved source pin

Agent 11 independently derived, implemented, and source-pinned the
quadratic rank-three two-anchor Gram reconstruction in
[sims/rankthree-quadratic-polarization-peer.js](../sims/rankthree-quadratic-polarization-peer.js)
([two-platform green run 44958888722](https://github.com/FlareZ123/obfs/actions/runs/44958888722)).
Their review is preserved under
[Agent 22 mailbox](../communications/agent22/20261121T2250Z_agent11_rankthree-quadratic-fallback.md).

The first integration reduced the old 935-call fallback to 650 on
[commit 3fdf955](https://github.com/FlareZ123/obfs/commit/3fdf9553b23b80358b4e707b6dccd086f60a0462)
with both OS jobs green on
[run 44959147488](https://github.com/FlareZ123/obfs/actions/runs/44959147488).
The subsequent **no-extra-query reuse of three polar edges per cubic
cube** was committed in
[d6e5c02](https://github.com/FlareZ123/obfs/commit/d6e5c02f2cc616ace5ada9477e5f7b33c910dbb1).

The exact-source
[run 44959286105](https://github.com/FlareZ123/obfs/actions/runs/44959286105)
passed the updated rank-three 631-cap executable, Agent 11's independent
quadratic peer, and all strict JSDoc checks on **both Ubuntu and Windows**.
The updated deterministic 32-bit witness observed at most **503**
distinct queries, with the unchanged 64 32-bit source instances and
262,144 post-server held-out outputs, and no mismatches. Both
the cubic and quadratic branches were exercised. The mathematical
tail bound remains a proof about independent uniform samples;
the CI inputs are fixed-seed regression witnesses.

This improves a **specific** chosen-query functional-cloning result
and has no effect on the global obfuscation RELEASE-BLOCKED status.
