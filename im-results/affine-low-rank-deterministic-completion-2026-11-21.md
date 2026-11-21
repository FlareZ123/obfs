# Deterministic affine completion as a fallback inverse for low-rank permutation oracles

**Agent 7, 21 November 2026. Intermediate, conditional candidate-elimination result.** The exact algebraic statement below was derived for this experiment and checked against source-pinned execution. Its originality relative to finite-field cycle inversion literature and the repository's earlier target-guided and randomized quotient-completion attacks is **unestablished**. It does not construct a strong obfuscator.

## Setting and promise

Let `V = GF(2)^n`, let `F:V->V` be a fixed unknown **permutation** accessible via a forward chosen-input oracle, and let `r` be a trusted **upper bound** on its public nonlinear output residual rank. Query the `n+1` points `0,e_0,...,e_(n-1)` and define

```
c = F(0)
M(e_i) = F(e_i) XOR c
D(x) = F(x) XOR c XOR M(x)
R = span{D(x) : x in V},  dim(R) <= r
d = nullity(M)
```

The representation `F(x)=c XOR A*x XOR W*g(x)` with invertible `A` and rank `W<=r` implies this residual-rank promise, but the construction does not receive `A,W,g`. For a permutation, `V=im(M)+R` implies `d<=r`. **A small observed sample cannot certify the global rank promise.** As earlier work observes, sparse isolated deviations can evade every basis probe.

## Fully deterministic method

1. Construct a basis from the independent columns of `M`, recording `d` dependent columns. For each dependent column, choose a standard basis direction `e_j` outside the growing column span, and set the new column of `H` to `M(e_i) XOR e_j`. Keep all independent columns unchanged. Each replacement expands the column rank by one, so `H` is invertible. Exactly `d` columns changed, whence `rank(H-M)<=d`. This uses **no additional oracle queries or random sampling**.
2. Define the publicly computable permutation `phi(x)=H^-1(F(x) XOR c)`. For every input,

```
phi(x) XOR x = H^-1(D(x) XOR (M-H)*x)
```

The RHS lies in `U=H^-1(R+im(M-H))`, a fixed subspace of dimension at most `r+d`. Thus `phi` preserves each coset `x+U`. Being a permutation, each of its cycles has at most `2^min(n,r+d)` points.
3. For any target `y=F(s)`, let `z=H^-1(y XOR c)=phi(s)`. Starting at `z`, repeatedly evaluate `phi` until it would return to `z`; return the predecessor as `s`. Because `phi` is bijective on a finite orbit, this is the unique preimage of `y`.

**Deterministic exact oracle bound:**

```
Q <= n + 1 + 2^min(n,r+d)
```

No probabilistic quotient-completion stage is needed; all post-interpolation queries are spent walking one short orbit. At `n=32`, `r=1,d=1` gives **at most 37 total forward queries**, and `r=3,d=3` gives **at most 97**. In comparison, the existing rank-one specialist has a stronger 35-query exact bound for its narrower model. The repository's existing randomized quotient-completion method has substantially better *expected* bounds for several low-rank cases. The deterministic fallback trades a potentially larger orbit for the absence of a tail event where sampling does not span the missing output quotient.

## Implementation and independent validation

The JavaScript implementation `invertLowRankDeterministic` in [`sims/affine-low-rank-oracle.js`](../sims/affine-low-rank-oracle.js) uses the existing GF(2) bit-column, rank-extension, and inverse helpers. It accepts only unsigned 1–32 bit integer oracle inputs/outputs and `rankBound<=16`. Its default practical orbit cap is 65,536 queries; callers may explicitly provide a larger `maxOrbitCalls` up to the algebraic bound. A finite cap below the actual cycle length throws a `RangeError`, and no inverse is claimed. The bound above is mathematical and remains conditional on the true permutation/residual-rank premise even if the implementation caps its work.

The independent generator/test `test/affine-low-rank-deterministic-completion.test.js` checks:

- **Every one of the 40,320 three-bit permutations and all eight distinct inverse targets each:** 322,560 exact inversions and the per-case query/cycle-length accounting. These use `r=3`, so they are whole-domain exhaustiveness controls rather than evidence of asymptotic savings.
- **144** fixed 32-bit rank-one transposition inversions with 12 independently seeded invertible output maps and translations. The public affine interpolant is truly singular with `d=1`; all recoveries require at most 37 queries.
- **192** fixed 32-bit rank-one inversions under separately hidden invertible input and output maps, random translations and varied targets.
- **208** fixed 32-bit rank-three inversions from three disjoint sparse transpositions `(1,72)`, `(2,144)`, `(4,288)`. The three displacement differences `73`, `146`, `292` are independent, so the global nonlinear displacement span has rank exactly three. The source affine interpolant has **nullity three** and is tested under 16 independently generated invertible output coordinate maps and held-out targets. Every inversion uses at most `33+64=97` forward queries.
- **144** further 32-bit rank-three inversions under independently hidden invertible input/output coordinates and translations. These test the rank promise even where source-basis singularity disappears through an input change of coordinates.
- Explicit refusal for a falsified rank promise, malformed orbit caps, and an honestly exhausted one-query orbit budget.

The expanded implementation and all test cases were run in the repository's existing two-platform low-rank workflow, **no new workflow**: [CI 44947071563](https://github.com/FlareZ123/obfs/actions/runs/44947071563) at executable SHA `439ec1b95b534c4e602e285fbcee02d20fc180cf`, **success** on Ubuntu and Windows Node 22, including the existing low-rank regressions and strict project typechecks. The expanded six deterministic tests passed in the first-stage suite on both platforms. Earlier four-test source [44946664822](https://github.com/FlareZ123/obfs/actions/runs/44946664822) also passed and is superseded for the source-coincident regression claim. All random-looking matrices and targets are deterministically generated from fixed test seeds; no runtime randomness is needed to invert.

## Scope and candidate decision

This is an executable **attack-side veto** for permutation-based protection ideas satisfying a proven small nonlinear output-displacement rank. It gives a deterministic query ceiling even when the publicly observed affine interpolant is singular and the true displacement subspace is unknown. It does **not** prove any candidate's rank is small, provide exact source recovery from JavaScript, defeat domain or authorization checks, clone stateful APIs in general, or establish obfuscation performance. Source-aware static attackers may do much better than any black-box inversion bound.

Further independent algebraic review and a specialized prior-art search are needed before claiming this statement as a new academic result. Keep it in `im-results/`, leave the main strong-obfuscation release **RELEASE-BLOCKED**, and use the method as a simple fail-fast check when a candidate already has a justified low-rank promise.
