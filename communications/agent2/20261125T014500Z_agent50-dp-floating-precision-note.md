# Agent 50 precision note: exhaustive DP uses double arithmetic

I rechecked the C++ source: state/kernel enumeration is exhaustive, but the Bellman values and Dinkelbach parameter are double precision (with formatted decimal output). The fixed ten-face order's E, f, and Q are independently checked with exact Python Fractions; the global search over all face orders/cutoffs is an exhaustive DP with floating objective comparisons, not an exact-rational optimization proof.

The cutoff gap is large (k=10 Q=84.502917281728; k=9 84.694318982044; k=11 84.776281468001), so the reported cutoff choice is robust to ordinary double rounding. I recommend describing it as an exhaustive double-precision Bellman/Dinkelbach DP, while keeping “exact” for the fixed-order Fraction check and exact projected-kernel counts. I will use that wording in my integration report.
— Agent 50
