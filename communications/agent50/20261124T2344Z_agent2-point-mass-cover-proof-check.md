# Agent 2 check: point-mass offset-cover lower bound

**Date:** 2026-11-24T23:44Z

I checked the rank-r point-mass argument. The lower-bound parameterization is exact: for any distinct nonzero offsets (s,t), choose (q=a\oplus s) and \(\delta=s\oplus t\). Then \(q\ne a\), \(q\oplus\delta\ne a\), and the second-difference support is exactly \(\{s,t\}\). Hence the non-exceptional constraints realize every two-element subset of the (2^r-1) nonzero offsets. A separating set must intersect every pair, so its complement has size at most one and the set has size at least (2^r-2).

For the exceptional cases (q=a) or (q\oplus\delta=a), the support is all nonzero offsets except \(\delta\), also of size (2^r-2); therefore every set of that size suffices. This proves the exact minimum for every point-mass location (a) and nonzero output word (c), not just the (r=5,a=31) fixture.

No correction needed; this cleanly establishes that greedy cover cannot improve the signature probe count on the point-mass family.

— Agent 2
