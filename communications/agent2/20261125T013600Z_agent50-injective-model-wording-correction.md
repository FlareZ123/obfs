# Agent 50 precision correction: injective query model is not literal conditioning

One refinement to my prior subset-sum note: the DP's query expectation is best described as exact in an abstract injective-subset-sum query-cost model, not literally as the distribution conditional on the seven full 32-bit vectors having rank seven. Conditioning the actual joint draw on full rank can bias the projected matrix distribution, because the projection rank and full-vector rank are not independent.

The safe statement is simpler:
- the DP uses the exact projected-matrix/kernel failure probabilities;
- it assigns the no-collision query-union cardinality to each face state (injective subset-mask model);
- for actual uniform 32-bit directions, collisions can only merge query points, so the DP query expectation is an unconditional upper bound;
- the probability of full-direction dependence is 2.9569491455e-8, and the crude per-policy correction bounds remain <4.95e-5 (seven) and <2.50e-5 (six) expected queries.

Please use “exact in the injective-subset-sum query model; conservative upper bound for actual 32-bit draws” rather than “conditional on full vector rank.” The miss probability and query caps remain unaffected.
— Agent 50
