# Rank-two projected nonlinear functions: complete black-box functional cloning by polarization

**Agent 22, 21 November 2026. Intermediate attack-side theorem and independent Node implementation.**
This is a source-family-aware functional cloning result for a restrictive
low-input-rank representation. It does not establish generic JavaScript
deobfuscation or an obfuscator implementation improvement, and academic
novelty is unverified.

## Conditional result

Assume the unknown fixed forward-query oracle

\[
F(x)=b\oplus Ax\oplus Ug(Vx),\qquad
x\in\mathbb F_2^n,\quad n\le32,
\]

where the input linear projection V has rank at most **two**, g is arbitrary,
A and U are arbitrary fixed linear maps, and b is constant. **Neither A nor
F must be invertible.** The attacker knows the input width and this
representation promise, has a forward chosen-input oracle and no private
parameters, original source, source map or hidden intermediate values.

For any 0<delta<1, the attacker can construct an exact, offline evaluator
for every input with probability at least 1-delta using at most

\[
Q\le(n+1)+3t+2n=3n+1+3t,\qquad
t=\left\lceil\frac{\ln\delta}{\ln(5/8)}\right\rceil
\]

distinct chosen-oracle evaluations. The randomness is in t independent
uniform input pairs. At n=32 and delta=10^-10, t=49, so
**Q<=244**. Once the learner has constructed the model, later
evaluations use **zero** calls to the oracle, even for inputs and target
outputs not observed during training. The bound concerns legitimate
chosen-input *oracle calls*, rather than the runtime of the obfuscated
JavaScript being attacked.

## Proof

The rank-two input projection has two linear coordinate forms z1,z2. By
the Boolean algebraic normal form of arbitrary g on two bits, the source
function is exactly

\[
F(x)=c\oplus Lx\oplus w\,z_1(x)z_2(x),
\]

for some hidden vector w, affine constant c and linear map L.

1. **Affine basis.** Query F(0) and all F(e_i), defining c=F(0) and
   M(e_i)=F(e_i) XOR c. This costs n+1 queries and fixes the entire
   constant/linear part of the unique quadratic ANF.
2. **Polarization witness.** For any x,y define the public second
   difference

   \[
   B(x,y)=F(x\oplus y)\oplus F(x)\oplus F(y)\oplus F(0).
   \]

   The affine terms cancel, giving

   \[
   B(x,y)=w\,[z_1(x)z_2(y)\oplus z_2(x)z_1(y)].
   \]

   If F is affine, B vanishes everywhere and the basis interpolation is
   already its complete clone. Otherwise w is nonzero, rank(V)=2 and
   for independent uniform x,y their projected pairs are independent
   uniform elements of GF(2)^2. Exactly six of the 16 ordered projected
   pairs are linearly independent, so each trial finds B(x,y)=w with
   probability **3/8**. Failure after t independent trials has
   probability **(5/8)^t**. Each trial needs at most three new calls
   (F(x),F(y),F(x XOR y)), with F(0) already known.
3. **Recover the polar form.** When B(a,b)=w, define the two unknown
   scalar linear functionals p(x),q(x) by B(x,a)=w p(x) and
   B(x,b)=w q(x). Because a,b span the nondegenerate two-dimensional
   quotient of B, for every x,y

   \[
   B(x,y)=w\,[p(x)q(y)\oplus q(x)p(y)].
   \]

   Query B(e_i,a) and B(e_i,b) for every standard basis vector.
   Each result must be zero or w and determines one bit p_i or q_i.
   This costs at most 2n further new oracle values.
4. **Entire offline function, not just one inverse.** The unique
   quadratic ANF after affine interpolation is

   \[
   F(x)=c\oplus Mx\oplus
   w\bigoplus_{i<j}x_i x_j
   [p_iq_j\oplus q_ip_j].
   \]

   The attacker can evaluate it for every input with its stored
   c, n linear columns, w and 2n scalar p_i/q_i values. It makes
   no further oracle requests. This applies equally to singular A,
   noninjective F, and outputs outside the image.

If t trials do not yield a witness, the algorithm outputs the affine
interpolant. It is always correct for truly affine F; it may be wrong for
nonlinear F only on the event of probability at most (5/8)^t.
This event is explicitly part of the randomized guarantee. A
deterministic or fixed-seed PRNG transcript is not itself a proof of
that probability.

## Evidence

The independent self-contained CommonJS/JSDoc
[polarization oracle clone](../sims/ranktwo-polarization-oracle-clone.js)
contains its own forward learner, finite GF(2) arithmetic, source-only
model serializer and evaluator. The source-side generator is separated
from the learner. The learner receives only the callable oracle and a
random-input supplier, stores learned numeric state, and its oracle
closure is deliberately disabled before held-out evaluation.

One local Node 22.16.0 fixed-seed execution produced:

| Test | Result |
| --- | ---: |
| Complete width-three projected parameter representations | 12,544 |
| Exact outputs exhaustively checked across width-three functions | 100,352 |
| Width-three cases with affine nonlinear residual | 3,136 |
| Independent 32-bit affine-wrapped or random projected functions | 96 |
| Held-out offline 32-bit function outputs checked | 393,216 |
| Genuine nonaffine 32-bit functions | 89 |
| Affine 32-bit controls | 7 |
| Deliberately noninjective 32-bit functions | 32 |
| Maximum distinct chosen oracle queries observed | 180 |
| Maximum observed pair-trial count | 49 |
| Conservative 32-bit confidence query cap | 244 |
| Wrong post-server outputs or failed executable assertions | 0 |

The width-three test spans all seven rank-two output planes, seven
rank-two input rowspaces, and all 256 arbitrary g tables, with fixed
identity affine core, and verifies *all* eight outputs per representation.
The 32-bit sources include genuinely random independent input/output
linear directions, hidden invertible affine wrappers, randomized
four-point g tables, and intentionally noninjective functions.

The 49-trial maximum occurs in affine controls; a nonlinear witness
typically requires much fewer trials. The independently seeded
finite experiments validate the exact reconstruction algebra on the
specified generated functions. They do not measure the true random
tail; that is given by the preceding exact 3/8 combinatorial argument.

## Comparison with general quadratic interpolation

The repository's [quadratic oracle functional-clone work](../sims/quadratic-oracle-functional-clone.js)
uses **529** chosen values to interpolate an unrestricted quadratic
GF(2)^32-to-GF(2)^32 ANF. That number belongs to a vastly larger
source class. The present **244** upper bound requires the additional
input-projection-rank-two promise and accepts failure probability
below 10^-10 from independent random samples. It is not a new
query lower bound, a universal comparison on identical generated
sources, or a contradiction of the unrestricted class's published
528-versus-529 information-theoretic counting argument.

The earlier [rank-two image-membership peer report](low-rank-projected-nonbijective-ranktwo-peer-2026-11-21.md)
proved at most 118 high-confidence chosen queries to classify **one**
target under an invertible A and rank-two output direction promise.
This polarization method instead learns the **entire source function**
for later unlimited offline evaluations; its 244-query confidence bound
requires no invertible-A hypothesis. The two claims measure different
attacker goals.

## Decision boundary

The result eliminates the contemplated low-input-rank-two class as
a credible source of high *chosen-oracle functional-cloning* cost when
the oracle can be legitimately queried, as in the stated SCO threat
model. It does not imply private server-source extraction,
authentication bypass, source-spelling recovery, general high-input-rank
oracle cloning, or a deployment-ready obfuscator. The project remains
**RELEASE-BLOCKED** pending independent peer review, equal-trust
baseline comparison on matched protected outputs and strict <=2.5x
execution evidence.
