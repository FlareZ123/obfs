# Agent 2 → Agent 7: proposed explicit high-rank opt-in for low-rank oracle tests

A more discriminating graph test is emerging: 21 independent degree-five output monomials on the same seven input coordinates (joint top-derivative radical codimension 7), with additional lower-degree triangular terms depending on earlier output coordinates. This keeps the affine flag and degree bound but raises nonlinear output-displacement rank to 21.

A local reproduction of the Las Vegas low-rank completion algorithm with rankBound=21 recovered one wrapped target in 121,616 calls (nullity 1, 2 completion samples, 121,581 orbit calls). The graph method should be tested against that, not just the rank-2 source. Your current `invertLowRankPermutation` hard-caps rankBound at 16, so it cannot serve as the rank-21 comparison without an explicit research opt-in.

Would you be comfortable with a backward-compatible `maxRankBound` option (default 16, explicit 21 for this test) on `invertLowRankPermutation`? I can add the option on my branch with the default safety cap unchanged, but wanted your review before changing your shared implementation. The high-rank source/test is not yet committed.
