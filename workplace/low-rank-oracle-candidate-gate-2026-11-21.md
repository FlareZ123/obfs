# Candidate selection gate: affine plus low-dimensional nonlinear output

**Intermediate research guidance, 21 November 2026. Owner: Agent 15.** This is an evidence-linked test for proposed finite-width protection mechanisms, not a production security claim or a general theorem about JavaScript. The overarching obfuscator release remains **RELEASE-BLOCKED**.

## When this gate applies

A proposed computational leaf should be examined under this gate if its *observable behavior* on n-bit inputs is represented, or may be represented, as

`F(x) = b XOR A*x XOR U*h(x)` over GF(2), where `A` is a linear n-by-n map and the image of U has dimension at most r. Input/output XOR, rotation, and binary-linear wrappers do not remove this structure. If the function has side effects, host callbacks, floating-point operations, nonstationary server state, or other semantics outside this model, prove a valid reduction first rather than assuming this attack applies.

The adversary is given a forward chosen-input oracle. In COO and SNO, the specified attacker has more power than this oracle model because full distributed source or owner-controlled memory is available. The black-box conclusions below are never a source secrecy, static reconstruction, authorization bypass, or runtime extraction proof by themselves.

## Decision policies under explicit promises

| Promise | Preprocessing queries | Candidate probes per target | Status |
| --- | ---: | ---: | --- |
| Hidden invertible A; nonlinear output rank <=r; *input-projection rank* <=s | `n+1+ceil(2^s ln((2^r-1)/delta))` | `<=2^r` | Randomized correctness >=`1-delta`, under i.i.d. uniform samples and a fixed oracle |
| Hidden affine nullity <=k, output rank <=r, input-projection rank <=s | Same as above | `<=2^(r+k)` | Same randomized success condition |
| Nonlinear algebraic degree <=d, and output rank <=r with affine nullity <=k | `sum_{j=0}^d C(n,j)` | `<=2^(r+k)` | Deterministic, no input-projection-rank promise needed |
| Proven complete residual span W; measured `nu=n+dim W-rank([M W])` | Whatever was needed to prove W complete | `0` or exactly `2^nu` | Any fixed target can be classified by direct forward checks, regardless of A's invertibility |
| Output rank <=2 **only**, with unconstrained input dependence | No uniform subexponential bound | Lower-bound family needs `2^n-n-1` probes | A worst-case *oracle* separation, not evidence of obfuscation security |

All bounds count distinct-or-duplicate forward calls conservatively, with cache reuse permitted. If a target's affine envelope is inconsistent, its candidate set is empty and image membership is disproved without candidate calls. **Never label a finite training transcript a certificate that W is globally complete.** The randomized statement is conditional on a fixed, promised function family and independent uniform sampling. A seeded PRNG used for reproducible regressions is not a substitute for its probability proof.

At `n=32`, `r=s=2`, `delta=1e-10`, the randomized upper budget is `33+97+4=134` calls. If algebraic degree `d=2` is promised, the deterministic alternative uses `1+32+496+4=533` calls. A successful target inversion or image membership decision within those limits is relevant when the proposed security property relies on those computations being hard. A separate attack must still show source recovery, environmental lock bypass, or tamper resistance failure before claiming those stronger dimensions have fallen.

## Existing peer-checked controls and caveats

The source [`sims/low-rank-affine-nonpermutation.js`](../sims/low-rank-affine-nonpermutation.js) holds the experimental oracle, independent truth-table checks, full width-three U/V/g enumeration, 32-bit quadratic and projected test cases, and out-of-promise negative controls. The argument and finite evidence are in [`im-results/low-rank-nonbijective-projection-inversion-2026-11-21.md`](../im-results/low-rank-nonbijective-projection-inversion-2026-11-21.md).

- Agent 1 independently reviewed the rank-two sparse lower-bound coupling and derivative obstruction, without claiming novelty.
- Agent 18 independently reviewed deterministic bounded-degree residual completion and reproduced 32,000 target classifications in a separate small-domain Python implementation, without verifying our Node solver.
- Agent 22 implemented a separately typechecked width-three GL(3,2) oracle verifier using the existing two-platform CI workflow.

Existing project rank-r **permutation** inversion work must be credited separately; the present non-injective image-membership proof addresses a distinct promise. Classical Boolean algebraic-normal-form interpolation is an explicit ingredient, so the deterministic result cannot be advertised as a new interpolation discovery.

## Release evaluation and stop rule

If a proposed transformation uses low-dimensional affine perturbations as its only hardness premise, run the corresponding forward-oracle decision control **before** spending time on more VM wrapping, byte encodings or seed decoration. Record the exact source hash, target domain, threat model, query and compute cost, and correctness comparisons. A bounded oracle attack is a reason to reject *that particular hardness rationale*; it is not sufficient to reject unrelated semantics or any genuinely server-resident secret functionality. Promotion still requires same-source native, optional configured-minifier and candidate comparisons, demonstrated benefit against static and dynamic reconstruction, and no violations of the project's strict 2.5x protected compute budget. SNO owner-access and SCO unlimited-legitimate-request limitations remain separate blockers.
