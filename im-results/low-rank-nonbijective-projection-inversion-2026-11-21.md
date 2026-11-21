# Non-bijective low-rank masks: a chosen-query image-membership criterion

**Agent 15, 21 November 2026. Intermediate attack-side theorem, pending independent review.**

## Promise and bounded claim

Let F:GF(2)^n -> GF(2)^n be an unknown fixed function with the representation

    F(x) = b XOR A*x XOR U*g(V*x)

where A is invertible, U has output rank at most r, V has input rank at most r, and g is completely arbitrary. Neither F nor g is required to be injective. The attacker receives only n, r, a forward chosen-input oracle and a target output y, without A, U, V, b or g.

After n+1 affine-basis queries, choose

    q = ceil(2^r * ln((2^r-1)/delta))

independent uniform inputs, for any 0<delta<1. With probability at least 1-delta, this preprocessing is sufficient for *every* target y to return a verified preimage x satisfying F(x)=y or correctly decide that no preimage exists. At most 2^r further queries are required per target. One-target total <= n+1+q+2^r. For separately known input-projection bound s and output bound r, use 2^s in the sampling term. This is a conditional, randomized black-box decision result, not a statement about arbitrary JavaScript or generic obfuscation.

## Proof

Query c=F(0), F(e_i), and let the public linear interpolant M have columns F(e_i) XOR c. Since M=A XOR U*D for a linear map D, rank(M)>=n-r. The residual R(x)=F(x) XOR c XOR M*x lies in im(U). Let W be the span of all R(x), with dimension t<=r.

For any nonzero scalar linear functional lambda on W, the Boolean lambda(R(x)) equals h(V*x) XOR L*x for some arbitrary h and linear L. If L is nonzero on ker(V), the expression is balanced over each projection fiber, so Pr[lambda(R(x))=1]=1/2. Otherwise L factors through V and the expression is a nonzero function of at most r uniformly distributed projection bits, so its nonzero probability is at least 2^-r. A batch of q independent uniform draws fails to span W only if one of the 2^t-1 nonzero functionals vanishes on every sample. Its probability is bounded above by (2^t-1)(1-2^-r)^q <= (2^r-1)*exp(-q/2^r) <= delta.

When the full W has been observed, for any y solve the public affine system

    C_y = { x : (y XOR c XOR M*x) belongs to W }.

Every genuine preimage lies in C_y. For x1,x2 in C_y, d=x1 XOR x2 satisfies M*d in W <= im(U). Since A*d=M*d XOR U*D*d, d lies in A^-1(im U), a subspace of dimension at most r. Thus C_y has at most 2^r elements whether or not F is a permutation. Enumerate solutions to [M | basis(W)]*(x,z) = y XOR c with ordinary GF(2) elimination, and check each x with the oracle. Finding one proves preimage existence; exhausting all proves absence, conditional on complete W. If C_y is empty, y is likewise unreachable.

**Constructive out-of-promise false-negative control.** The reproducer also
fixes a 12-bit non-injective `F` equal to the identity except
`F(0x5a8)=0x5a9` and `F(0x5a9)=0x5aa`. Its nonlinear output
differences span only two directions, but recognizing the two rare inputs
requires more than two projected input bits. With a deterministic
sampling transcript containing no modified input, the observed residual span
is zero, and the solver incorrectly calls `0x5a9` unreachable even though
`F(0x5a8)=0x5a9`. This deliberately violates the input-projection
assumption; it demonstrates why a low *output* rank alone does not justify
the advertised non-injective image-membership sampling bound. The check is
neither a probabilistic tail estimate nor a counterexample to the stated
rank-bounded theorem.

The finite sampler cannot independently *certify* global completeness of W. If g depends on arbitrarily many input bits without a low-rank V projection, a rare residual could evade the advertised q samples. The probability guarantee requires fresh independent uniform samples; a fixed-seed PRNG used for deterministic testing is not a substitute.

## Local independent finite witness

The self-contained Node 22.16.0 CommonJS witness `sims/low-rank-affine-nonpermutation.js` constructs random hidden A, U, V, arbitrary g and three families, including many-to-one cases. It independently exhausts all 4,096 input points for every 12-bit specimen; only a forward function callback is supplied to the attacker. A deterministic fixed-seed test run observed:

- 540 fully truth-table-checked functions; 274 with nonzero residual rank and 203 with singular public interpolants.
- 152 genuinely non-bijective fixtures and 152 separately checked unreachable outputs.
- 540 held-out target checks, with correct preimages.
- 24,576 exact image-membership classifications across six 12-bit r=2/3 non-bijective fixtures, all matching independent full truth tables.
- Maximum tested affine-envelope candidate count 8 and maximum conservatively counted calls 220, below the r=3, delta=1e-10 bound of 221.

These finite observations validate the witness algebra on the sampled cases, not the theoretical probability claim. The candidate must undergo independent proof review and source-pinned multi-platform execution before promotion to `results/`. No source-code secrecy, 2.5x candidate compute compliance, universal environment lock or production obfuscation improvement is claimed.

## Deterministic extension: low algebraic degree plus low output rank

An exact, seedless alternative recovers the complete residual span when
`F(x)=b XOR A*x XOR U*h(x)`, `A` is invertible, `rank(U)<=r`,
and every coordinate of the otherwise arbitrary Boolean vector `h(x)`
has algebraic degree at most `d>=1`. The input functions may depend on
**all** `n` input bits; no low-dimensional projection `V` is required.
The original `h(Vx)` input-rank-`r` promise implies `d<=r`, so this
also derandomizes the preceding image-membership criterion, at higher query
cost for some parameters.

After the affine-basis queries, evaluate each binary input vector of
Hamming weight `2,...,d` exactly once and span their observed residual
vectors `R(x)=F(x) XOR F(0) XOR Mx`. Every coordinate of `R` has a
unique algebraic normal form of degree at most `d`; its coefficients
are determined by values at Hamming weights at most `d`, using the
Boolean Möbius inversion formula
`a_S = XOR_{T subset S} R(1_T)`.
Hence each possible `R(x)` lies in the span of these observed values.
Weights zero and one have residual zero by construction, so
**the residual span is complete deterministically** after exactly
`sum_{j=2}^d binom(n,j)` extra chosen inputs. The same
affine-envelope elimination proves at most `2^r` candidates per output,
and checking those candidates returns a genuine preimage or establishes
that the target is outside the image.

A conservative total upper bound, counting training and candidate probes,
is therefore

`Q <= sum_{j=0}^d binom(n,j) + 2^r`.

At `n=32` with `d=r`, this is **35** calls for `r=1`,
**533** for `r=2`, and **5,497** for `r=3`. This is a
deterministic, conditional oracle-call bound, with no claim about the
instruction cost of the full solver or universal JavaScript behavior.
Known-degree Boolean interpolation is standard (for an explicit
ANF/Möbius coefficient formula, see [the Boolean-function algebraic-degree
study](https://link.springer.com/article/10.1007/s12095-025-00839-x)
and [the ANF implementation reference](https://booleanfunction.github.io/efficient-implementation.html)),
and the repository already has separate bounded-degree
*functional-cloning* attacks; the refinement
here couples a complete residual span to small-coset
**non-injective image membership**. Novelty needs independent review.

The new `learnLowDegree` implementation is in the **same**
`sims/low-rank-affine-nonpermutation.js` witness. Its local deterministic
source-only run checked **180** independent original
input-projection fixtures and **12** additional full-input quadratic,
rank-two output-displacement fixtures. Exact full-domain truth tables
established the observed residual span was globally complete, and
**17,700** direct image-membership classifications agreed with independent
truth tables. All 12 quadratic specimens had no nonzero direction with
constant derivative, certified by their degree-two structure and
basis-derivative checks; consequently none admits an alternate
lower-rank input projection in an affine-plus-projected form. The largest
observed conservative training-plus-candidate query count was **307**
(the width-12 `d=3,r=3` worst-case bound). An additional **32-bit** quadratic source-side witness uses two
linearly independent fixed 32-bit output displacement masks, a hidden
nonidentity invertible GF(2) affine core (16-bit triangular mixing
followed by a 9-bit rotate and constant), and two different quadratic
pair parities covering all 32 input coordinates. The independent
reference explicitly reverses the affine core after enumerating the
true four-point output-displacement coset, whereas the attacker
observes only the forward oracle, rank and degree promises. It also
checks 2,048 random affine inverse roundtrips.
The first quadratic has a nondegenerate pairwise polar form, so no
nonzero input direction has a constant derivative; the published
`rank(V)<=2` input-projection hypothesis is inapplicable, while
the rank-two **output** and degree-two hypotheses hold. Deterministic
learning made exactly **529** basis/weight-two oracle observations,
then classified **2,048** held-out 32-bit targets against an
independent oracle using the four true displacement coset points:
**1,743 reachable, 305 unreachable**, with at most four candidates
checked per target. The fully independent reference uses the known
two output directions only as a verifier; the attacker receives
forward queries and the rank/degree promises, with neither the affine
core nor the output directions supplied. This validates a genuinely
noninjective 32-bit non-projection instance locally.

A new **full parameter enumeration** at width three checks
all **42** ordered independent rank-two input projections,
all **42** independent output bases, and every one of
the **256** possible two-bit to two-bit nonlinear truth tables,
for **451,584** represented functions at public `A=I,b=0`.
It checks **all eight targets per function**, totaling **3,612,672**
exact classification comparisons against independently enumerated
8-point output truth tables. Of the parameterizations,
**379,008** are nonbijective and **261,504** have a singular
public affine interpolant. Each deterministic learner makes exactly
seven degree-two training observations, with at most four candidate
inputs subsequently checked. This fully enumerates that finite
low-rank input/output projection parameter space, with repetitions
allowed between equivalent representations. It does not exhaust all
32-bit or arbitrary JavaScript mappings, and it does not test a
different hidden full-rank A directly. Locally this expanded complete
standalone witness took about five seconds on Node 22.16.0; a matching
Windows/Ubuntu source-pinned CI result is still required.

The original deterministic width-12 source including 192 finite
fixtures passed source-pinned Ubuntu/Windows Node 22 and strict JSDoc
in [manual run 44955704794](https://github.com/FlareZ123/obfs/actions/runs/44955704794)
at `5e46ee14e724ed290d089ed493b270a9ddbe8ca0`.
The first, **unwrapped** width-32 source also passed the Ubuntu/Windows
workflow in [run 44955906851](https://github.com/FlareZ123/obfs/actions/runs/44955906851)
at `504b62bcd268cf10bbed13bc8f6134c2a10aafeb`.
The revised, wrapped width-32 witness is a **new source revision**
requiring separate two-platform CI; its local execution alone cannot
extend the above source-pinned claims. Independent mathematical review
remains necessary.


## Matching negative control: output rank two alone permits exponential image-membership uncertainty

This is an elementary forward-oracle lower-bound construction, **not a
novelty or production-obfuscation claim**. It makes the input-projection
assumption in the upper-bound theorem decision-critical.

Let `n>=3`, `e_0=1` and
`H=GF(2)^n \ {0,e_0,...,e_(n-1)}` of size
`N=2^n-n-1`. Fix the public target `y=0`, public affine core
`A=I,b=0`, and even reveal the complete family of possible oracles.
Define `F_none(0)=1`, and `F_none(x)=x` for every other input. For
each hidden `h in H`, define `F_h(h)=0` and
`F_h(x)=F_none(x)` elsewhere.

Every oracle has an affine plus nonlinear *output*-displacement
representation of rank at most two:
`F_none(x)=x XOR u(x)` where `u(0)=1`, zero elsewhere;
`F_h(x)=x XOR u_h(x)` where `u_h(0)=1`,
`u_h(h)=h`, and otherwise zero. The displacement subspace of
`F_h` is exactly `span{1,h}`, dimension two. All functions are
non-injective. But `0` is unreachable for `F_none` and has
the unique preimage `h` under `F_h`.

**Exact deterministic lower bound.** Each of the `N` hidden inputs
must be queried in the worst case for a zero-error algorithm that always
decides whether `0` is reachable in this family. Until a particular
`h` is queried, `F_h` and `F_none` return identical responses,
even to adaptive queries, and require opposite answers.

**Randomized bounded-error lower bound.** For any adaptive randomized
algorithm making at most `q` forward queries and having error at most
`delta<1/2` on *every* family member, coupling its random coins when
run against `F_none` and a uniformly chosen `F_h` gives
`q/N >= 1-2*delta`. The coupled transcripts can differ only if the
`F_none` execution queries the uniform hidden `h`, which occurs
with probability at most `q/N`. Yet correctly distinguishing the
negative baseline from positive alternatives requires a probability
difference of at least `1-2*delta`. Therefore
`q >= (1-2*delta)*(2^n-n-1)`. This lower bound counts all query
phases and holds even when `A`, the target, and the family are public.

These oracles **violate the input-projection rank promise** of the
positive upper-bound theorem. In fact, each fixed `F_h` has
nonconstant directional derivative along every nonzero input direction:
outside the two modified inputs the derivative is `k`, but at input
zero it is different. In any representation
`F_h(x)=b'+A'x+U'g(V'x)`, a nonzero direction in `ker V'`
would make its derivative constant, which is impossible. Thus `V'`
must have full input rank `n`; this is stronger than merely saying
the displayed representation uses `V=I`.

The deterministic width-eight witness in
`sims/low-rank-affine-nonpermutation.js` enumerates all **247**
hidden locations, evaluates all **63,232** resulting
input/output pairs, verifies every rank-two displacement and all
**2,223** matching basis-query responses, and checks that **217**
hidden alternatives remain indistinguishable from the negative baseline
after 30 additional distinct candidate probes. These are finite exact
controls for the family, not a general theorem proof by enumeration.

The result rules out an input-projection-free extension of the
`O(2^r)` non-injective image-membership decision criterion at fixed
output rank `r=2`. **Do not confuse this oracle lower bound with
obfuscation security:** an attacker holding published COO files or
full-control SNO filesystem/memory can read an explicitly encoded hidden
location or instrument its check. Even for SCO private code, the
specified unlimited authorized request model, side channels and
unmodeled static leakage require separate attack and runtime-cost
comparisons. The lower bound considers *only forward black-box
evaluation* of a particular promised family, and charges all queries. It does not conflict with the separate,
already-established **permutation** inversion attacks, whose
bijectivity promise excludes the negative baseline here.

## Relationship to prior repository results

The previously established rank-r permutation attacks (`im-results/affine-low-rank-oracle-inversion-2026-11-21.md` and `im-results/affine-low-rank-deterministic-completion-2026-11-21.md`) permit arbitrary full-input nonlinear displacement, but rely on bijectivity for their efficient orbit-based inversion. This witness instead handles possibly non-injective functions under a *low-dimensional input projection* promise, and can classify outputs that are not in the image. It is a new scoped branch of the repository's attack-side candidate-veto research rather than a new protected transform. The project remains RELEASE-BLOCKED for the primary strong-protection objective.
