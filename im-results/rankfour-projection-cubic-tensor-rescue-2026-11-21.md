# Rank-four projected quartic-free functions: cubic tensor signature reconstruction

**Agent 22, 21 November 2026. Provisional intermediate cryptanalytic result and code.**
This report is deliberately kept in intermediate results pending a complete source-pinned CI run and independent vector-valued proof review. It is a chosen-oracle attack on a fixed GF(2) functional family, not a production obfuscation technique.

## Conditional source and attack

Let F(x)=b XOR A*x XOR U*g(Vx), with hidden V of rank at most four, arbitrary vector-valued g and A/U possibly singular. Assume the quartic ANF coefficient is exactly zero. Then F has total Boolean degree at most three in the n original bits (n<=32). The attacker sees only a legitimate forward-input oracle and the projection-rank/degree promises.

For a target failure probability delta, set

    t3 = ceil(log(delta)/log(43/64)).

A complete source-only offline reconstruction should require at most

    7*t3 + 6*n + 8 + sum_{j=0}^2 binom(n,j)

distinct chosen oracle calls. At n=32 and delta=1e-10, t3=58, the conservative upper bound is **1,135** calls. The bound does not assume the original F is a permutation. It does not recover the source's spelling or original hidden parameters.

## Third-derivative signal and the three-anchor tensor signature

For a genuine cubic source, the public third finite difference

    T(a,b,c) = XOR over S subset {a,b,c} of F(XOR S)

is an alternating trilinear vector-valued form on the original n-bit input. It factors through the hidden projection V. A nonzero scalar output projection of T is an alternating 3-form on a quotient of dimension at most four; any nonzero alternating 3-form in dimension four has effective radical codimension exactly three. An independent uniform triple therefore returns nonzero with probability at least 21/64. This was separately checked for all 15 scalar alternating 3-forms on GF(2)^4 and 4,096 ordered triples per form: 1,344 nonzero witnesses per form. After 58 independent triple probes, the probability of missing a genuinely nonzero cubic is at most (43/64)^58, about 9.61019e-11.

Take any witness triple (a,b,c) with w=T(a,b,c)!=0 and define the vector-valued signature

    S(x)=(T(x,b,c),T(a,x,c),T(a,b,x)).

Its values at a,b,c are the three coordinate-independent vectors (w,0,0), (0,w,0), (0,0,w). Let K be the joint radical of T. Since T factors through a quotient of dimension at most four, K has codimension at most four. The signature satisfies ker S = K: if some x outside K has zero signature, then x is independent of a,b,c modulo K, the four form a spanning set modulo K, and alternating multilinearity forces T(x,y,z)=0 for all y,z, contradicting x outside K.

Hence the rank of S is three or four. Query S(e_i) for each original standard basis bit e_i, using at most six new oracle evaluations per bit because the third-difference cube vertices are shared between all three signatures. If the signature image has rank four, add one e_i signature independent of those of a,b,c. Every S(e_i) can then be expressed as a unique GF(2) combination of the three or four anchor signatures. Those coordinates recover the hidden effective cubic quotient without revealing V.

At most eight additional oracle calls complete a four-anchor cube (the original triple's eight vertices were already obtained). A Boolean Möbius transform extracts all cubic ANF coefficient vectors in the newly discovered quotient coordinates. The cubic polynomial H3 of these coordinate bits reproduces **all cubic terms** of the full F. Thus G=F XOR H3 has degree at most two, even if its input quadratic part lies outside the radical of T. The existing exact generic quadratic ANF learner recovers G from at most 1+n+binom(n,2) further chosen evaluations. The final offline evaluator is G_model XOR H3_model for every input.

If T is zero identically, generic quadratic interpolation is sufficient with no source error. If a nonzero T was missed by all 58 triples, quadratic fallback may be wrong; this is exactly the bounded randomized failure event. The guarantee needs independent uniform source inputs and a **fixed** F. The seeded test transcript is not independent evidence of the probability.

## Implementation and verification state

Self-contained strict JSDoc CJS implementation:
[sims/rankfour-projected-cubic-rescue.js](../sims/rankfour-projected-cubic-rescue.js). It trains only from a forward oracle, caches queries, stores a JSON-serializable cubic-quotient and a generic quadratic model, and evaluates after disabling the oracle.

The intended executable test enumerates **all 32,768 quartic-free four-bit scalar truth tables** and all **524,288** outputs, plus 24 randomized hidden rank-four 32-bit vector-valued sources (including six deliberately noninjective) and 24,576 held-out offline outputs. It asserts a maximum of 1,135 chosen inputs for the stand-alone quartic-free learner.

The initial shared workflow attempt uncovered a JavaScript signed-bit mismatch while comparing 32-bit tensor signatures to unsigned oracle values. The source was corrected at
[ad2e55f](https://github.com/FlareZ123/obfs/commit/ad2e55f3f18a857521acc341c6efdc8f6e5d03ae)
by normalizing XOR signature coordinates to unsigned 32-bit values.

A subsequent shared CI attempt failed in another agent's earlier SCO rank-six HTTP simulation, which had attempted to use a top-level array constant outside the selective partition grammar. Its author is repairing this concurrently. **Do not declare the fixed cubic-rescue source fully verified or integrate the new 1,135 bound into the rank-four general attack until this test step and strict typecheck pass on Ubuntu/Windows.**

## Potential effect on the existing rank-four full clone

The established [rank-four fourth derivative clone](rankfour-projection-fourth-derivative-functional-clone-2026-11-21.md) has a quartic branch of at most 1,426 chosen calls. Its old quartic-zero fallback uses at most 6,434 calls. Replacing that fallback with the present third-derivative + quadratic learner gives a **proposed combined conservative cap of 2,113 calls**, because it may add up to 1,135 new cubic/residual queries after the previous 33 basis and 945 quartic-phase calls. Quartic-present and quartic-free failure events are exclusive for a fixed source, so the same delta can bound each branch separately. This remains a *candidate bound* until source integration and tests pass. The stronger limit applies only to rank(V)<=4 and the source family above, not arbitrary JavaScript.

All evidence is attack-side and not an endorsement of the 2.5x obfuscated runtime or broader static/dynamic resistance release. The main three-mode program stays **RELEASE-BLOCKED**.
