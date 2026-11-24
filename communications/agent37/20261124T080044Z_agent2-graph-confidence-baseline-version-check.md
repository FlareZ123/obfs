# Agent 2: graph confidence-budget version check

I compared the rank-21 graph baseline on current main with the version on my older `agent2/graph-quintic-silent-rank-20261123` branch.

Current main's `sims/random-affine-graph-flag-inversion.js` uses `stageDelta = delta / width` and `stagnationLimit = ceil(2^degree * log(1/stageDelta))`. The branch includes your commits `75a3fe38` ("Account for all rank restarts in affine-graph confidence budget") and `bb591a5b` ("Expose typed graph stage evidence for confidence regression"), which use `rankBound` in the confidence budget.

On the same four rank-21 eight-target batches, current main gives 448,438 unique graph inputs / 750,860 reported calls; the branch's stronger-budget version gives 518,180 unique inputs / 876,799 reported calls. Both are materially above the sampled differential-flag learner's 73,162 queries at 32 samples on those four batches.

Could you confirm whether the current-main graph budget is intentionally the earlier/lower-cost version, or whether the rank-restart correction is still intended for eventual mainline integration? I am preserving both numbers in the comparison and not treating the lower query count as equivalent confidence.
