# Exact three-bit chosen-forward inversion minimax by nonlinear ANF output rank

**23 November 2026 — Agent 2. Classification: finite-model intermediate proof and exhaustive computation.** This is an adversarial *negative candidate-selection witness*, not a new obfuscation technique, general large-width theorem, or proof of the project's security or 2.5× compute requirement. Academic priority has not been assessed.

## Question and oracle model

Fix `V=GF(2)^3`, and let the unknown `F:V→V` be a **permutation**. The attacker knows a promised family `C`, receives a target value `y=F(s)`, and may ask chosen **forward** questions `F(x)` at arbitrary 3-bit inputs `x`. The goal is to return the *unique* preimage `s` with zero error, minimizing **worst-case number of oracle calls**. The attacker never sees the source, hidden affine parameters, preimage, or implementation. There is no authorization boundary, stateful API, host locking, or dynamic instrumentation in this game.

For each output-coordinate vector Boolean function, compute its algebraic normal form

```text
F(x) =  ⊕_(M⊆{0,1,2}) a_M ∏_(i∈M) x_i,   a_M∈GF(2)^3.
```

Let `r(F)` be the GF(2) dimension of the span of the *nonlinear* ANF coefficient vectors `a_{0,1},a_{0,2},a_{1,2},a_{0,1,2}`. Our model classes are

```text
C_r = {permutations F : r(F) <= r}, for r=0,1,2,3.
```

This condition is algebraically intrinsic to the public function (though not known from a small query sample); it does not depend on the particular hidden source representation. `C_0` is exactly the affine bijections. `C_3` is the complete `8! = 40,320` permutation universe. Each class is closed under arbitrary output XOR translation, making any announced target `y` equivalent to normalized output zero.

## Complete model counts and exact optimal inversion queries

Enumerate every possible permutation (all 8! truth tables), compute every 3-bit vector ANF by the Boolean Möbius transform, and perform GF(2) elimination on the four degree≥2 coefficient vectors. The exact histogram is:

| Intrinsic nonlinear ANF coefficient rank | Exactly this rank | Cumulative source count | Minimax chosen forward calls to invert a target |
|--:|--:|--:|--:|
| 0 | 1,344 | 1,344 | **4** |
| 1 | 9,408 | 10,752 | **5** |
| 2 | 18,816 | 29,568 | **6** |
| 3 | 10,752 | 40,320 | **7** |
| **All** | **40,320** | | |

The **maximal rank** column is a promise on the *complete truth table*, not a property that any finite limited-query sampler can certify at arbitrary width. The result counts **all possible adaptive query decisions and all consistent adversarial oracle replies** for each finite class: a lower bound rules out any deterministic zero-error strategy of depth one smaller; an upper bound provides an explicit adaptive policy of displayed depth. No random-trial inference or generic information lower bound is used. If a randomized strategy must have zero error and a hard worst-case query cap over all coins, the same lower bound also applies.

For the full rank-one class `C_1`, **four calls cannot guarantee inversion; five calls always suffice**. This is a finite-width improvement over using the general n+3=6 bound for a three-bit rank-one shear, and is not a claim of n+2 calls at width 32. The complete `C_1` has 10,752 unique functions; validating the policy against each of the eight announced target outputs independently gives **86,016 / 86,016** exact inversions with the rank-one specialized enumerator. The larger unified rank-hierarchy implementation checks the policy against output zero for all **86,016 cumulative** source instances across `C_0,C_1,C_2,C_3` (1,344+10,752+29,568+40,320), and output XOR translation supplies every other target.

## Exhaustive decision-tree proof and reproduction

The attacker maintains the bit set `S` of still-consistent permutations after queried pairs. The terminal predicate `T(S)` is true precisely when there exists a common input `s` such that every `F∈S` maps `s` to the normalized target `0`. With `Q` the set of previously queried inputs and remaining depth `d`, the exact adversarial game obeys

```text
Win(S,Q,d) = T(S)
  OR [d>0 AND exists x∉Q:
        for every v with S_(x,v)≠∅,
          Win(S_(x,v), Q∪{x}, d−1)],
S_(x,v)={F∈S:F(x)=v}.
```

The code memoizes exact sets `S` as finite BigInt bit sets, evaluates the existential choice over all eight possible inputs, and the universal reply over all eight possible outputs. Repeating a query gives no new information, so excluding `x∈Q` is without loss. Both the proof of sufficiency and impossibility are thereby finite exhaustive computations; a successful strategy is extracted by storing the winning input at each state. The code then simulates each source from the original starting set to ensure the extracted strategy reaches a common preimage and meets the stated bound. Because every source is a permutation, this common preimage is unique.

**Source code**: [`sims/width3-anf-rank-minimax.js`](../sims/width3-anf-rank-minimax.js), [`test/width3-anf-rank-minimax.test.js`](../test/width3-anf-rank-minimax.test.js). The simulator's exact depth histograms over **one target 0 per original source** are:

| Cumulative family | 1 query | 2 | 3 | 4 | 5 | 6 | 7 |
|--|--:|--:|--:|--:|--:|--:|--:|
| C₀ | 168 | 168 | 336 | 672 | — | — | — |
| C₁ | 1,344 | 1,344 | 1,344 | 1,848 | 4,872 | — | — |
| C₂ | 3,696 | 3,696 | 3,696 | 4,032 | 4,368 | 10,080 | — |
| C₃ | 5,040 | 5,040 | 5,040 | 5,040 | 5,040 | 5,040 | 10,080 |

The rank-one family is **independently generated a second way**, without ANF classification: enumerate all 168 invertible 3×3 binary matrices `A`, seven nonzero output directions `w`, sixteen Boolean truth functions invariant along `u=A⁻¹w` (four cosets), and eight output translations `c`. All **150,528** representations define bijections and reduce to exactly **10,752** distinct permutations. The program explicitly checks its full generated set is *identical* to the ANF-rank≤1 classification obtained from an entirely separate exhaustive enumeration of all 40,320 permutations. The independent [`sims/rankone-width3-minimax-inversion.js`](../sims/rankone-width3-minimax-inversion.js) and [test](../test/rankone-width3-minimax-inversion.test.js) prove failure at depth four, success at depth five, and check all 86,016 target instances. All are strictly JSDoc typechecked.

**Source-pinned evidence**: [focused Ubuntu/Windows Node22 validation 45109516443](https://github.com/FlareZ123/obfs/actions/runs/45109516443), pinned SHA `1813117b2644aab8a519912e3f12232b7f160108`, both operating systems passed the specialized rank-one minimax test, full 8! ANF set-equality audit and project/external strict JSDoc. The full rank-hierarchy test uses the same exact game and a separate source file, with its own CI pin to be added once the latest rerun finishes. Earlier failed focus runs were **harness errors**: an `assert.equal` used in place of `assert.ok`, then an explicitly typed `number[]` required for strict checkJs; neither failure was an adversarial inversion counterexample. Those red runs remain visible in Actions history.

## Interpretation and hard limits

- These are **finite n=3 exact source-family results**, not general n-bit theorems; the observed values 4/5/6/7 cannot be extrapolated as a linear rule at n32. In particular `C_3` includes every three-bit permutation and has a trivial `2^3−1=7` worst-case inversion strategy. General n-bit permutations need not have a polynomial query inverter.
- ANF coefficient rank is not the same as the *global nonlinear displacement-image rank* assumed by some existing low-rank inversion theorems unless a suitable affine baseline/representation has been proved. Only the rank-one `C_1` equality with the specialized rank-one representation was exhaustively checked in the second generator; no claim about hidden rank-r form for every higher-rank class is needed here.
- An adversary could sometimes do better with code inspection or instrumentation; none is granted or measured in this chosen-forward game. Unknown source-grammar promises and sparse deviations can invalidate an attacker's assumed class. There is no lower bound on general source reconstruction, no domain-lock bypass, no SCO account bypass, and no 2.5× application performance evaluation.
- Novelty relative to prior exact learning/minimax permutation literature has not been checked. Classify as **intermediate** until an independent proof review and relevant literature comparison. This does not alter the [RELEASE-BLOCKED decision](../results/README.md).

