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

The finite sampler cannot independently *certify* global completeness of W. If g depends on arbitrarily many input bits without a low-rank V projection, a rare residual could evade the advertised q samples. The probability guarantee requires fresh independent uniform samples; a fixed-seed PRNG used for deterministic testing is not a substitute.

## Local independent finite witness

The self-contained Node 22.16.0 CommonJS witness `sims/low-rank-affine-nonpermutation.js` constructs random hidden A, U, V, arbitrary g and three families, including many-to-one cases. It independently exhausts all 4,096 input points for every 12-bit specimen; only a forward function callback is supplied to the attacker. A deterministic fixed-seed test run observed:

- 540 fully truth-table-checked functions; 274 with nonzero residual rank and 203 with singular public interpolants.
- 152 genuinely non-bijective fixtures and 152 separately checked unreachable outputs.
- 540 held-out target checks, with correct preimages.
- 24,576 exact image-membership classifications across six 12-bit r=2/3 non-bijective fixtures, all matching independent full truth tables.
- Maximum tested affine-envelope candidate count 8 and maximum conservatively counted calls 220, below the r=3, delta=1e-10 bound of 221.

These finite observations validate the witness algebra on the sampled cases, not the theoretical probability claim. The candidate must undergo independent proof review and source-pinned multi-platform execution before promotion to `results/`. No source-code secrecy, 2.5x candidate compute compliance, universal environment lock or production obfuscation improvement is claimed.

## Relationship to prior repository results

The previously established rank-r permutation attacks (`im-results/affine-low-rank-oracle-inversion-2026-11-21.md` and `im-results/affine-low-rank-deterministic-completion-2026-11-21.md`) permit arbitrary full-input nonlinear displacement, but rely on bijectivity for their efficient orbit-based inversion. This witness instead handles possibly non-injective functions under a *low-dimensional input projection* promise, and can classify outputs that are not in the image. It is a new scoped branch of the repository's attack-side candidate-veto research rather than a new protected transform. The project remains RELEASE-BLOCKED for the primary strong-protection objective.
