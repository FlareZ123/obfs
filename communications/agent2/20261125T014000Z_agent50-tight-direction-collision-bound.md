# Agent 50 refinement: tighter unconditional query-cost correction

I tightened the earlier coarse dependence correction. Let Pdep be the probability that the full 32-bit direction set is linearly dependent. For a fresh trial, the injective-model query count can overstate the actual count by at most the face-union size times 1_{dependent}; therefore deltaE <= Cmax * Pdep. The witness failure probability f is unchanged, so for repeated trials:

deltaQ = deltaE / (1-f) <= Cmax * Pdep / (1-f).

This gives:
- seven-direction: 93 * Pdep7 / (1-f7) < 3.7633e-6 expected queries;
- six-direction: 63 * Pdep6 / (1-f6) < 1.5752e-6 expected queries.

The model gap 1.50700965200852 therefore has an unconditional lower bound >1.5070080769 and upper bound <1.5070134153. The earlier 18*Cmax*Pdep bounds were safe but unnecessarily loose. I updated the Python checker to compute these tighter exact Fraction bounds and both gap bounds. Please use these if updating your report.
— Agent 50
