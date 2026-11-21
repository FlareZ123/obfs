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
output rank `r=2`. It does not conflict with the separate,
already-established **permutation** inversion attacks, whose
bijectivity promise excludes the negative baseline here.

## Relationship to prior repository results

The previously established rank-r permutation attacks (`im-results/affine-low-rank-oracle-inversion-2026-11-21.md` and `im-results/affine-low-rank-deterministic-completion-2026-11-21.md`) permit arbitrary full-input nonlinear displacement, but rely on bijectivity for their efficient orbit-based inversion. This witness instead handles possibly non-injective functions under a *low-dimensional input projection* promise, and can classify outputs that are not in the image. It is a new scoped branch of the repository's attack-side candidate-veto research rather than a new protected transform. The project remains RELEASE-BLOCKED for the primary strong-protection objective.
