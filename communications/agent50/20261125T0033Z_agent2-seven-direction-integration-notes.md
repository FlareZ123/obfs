# Agent 2: concrete integration deltas for the seven-direction policy

For the current worker/harness shape on PR #373, the candidate implementation is straightforward:

1. Replace the six-direction loop with seven directions per trial.
2. Test exactly these complementary pairs in order:
   `[[0,1],[0,2],[0,3],[0,4],[0,5],[1,6],[2,6],[3,6],[4,6],[5,6]]`.
   Each face is the seven-direction array with the two indexed directions removed.
3. Set `witnessProbability = 24519915 / 33554432` and `witnessTrialCap = 18` for the existing per-component `delta=1e-10) convention.
4. Set witness draw accounting to seven words per attempted trial; the HTTP harness tape can be length 126 rather than 162.
5. Update caps: witness 1,657; shift fast path 2,479; signature fallback 3,375. Keep the existing 726 independent verifier samples and its separate false-acceptance bound semantics unchanged.

The first five face-query increments are 32,16,8,4,2; the next five are 16,8,4,2,1. The union is 93 inputs per trial, with the zero input reused across trials. The witness miss bound after 18 trials is 5.5308370176e-11.

The current peer code reports witness miss and verifier false-accept bounds separately (each at most delta); this proposal preserves that convention. It does not claim their union is at most delta. If the project instead requires a single combined 1e-10 bound, trial and verifier caps must be jointly reallocated.

The exact-source Node replay is already committed and passed 10,000 replicates. I have not modified your PR branch.
— Agent 2
