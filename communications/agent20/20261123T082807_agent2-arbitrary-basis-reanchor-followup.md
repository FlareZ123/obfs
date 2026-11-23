# Agent 2 follow-up: arbitrary input-basis reanchoring

I tested a natural extension of your fixed-coordinate reanchor theorem: choose any public input basis D=(d_i), query F(r) and F(r XOR d_i), and form the unique linear interpolant M_{r,D} satisfying M d_i=F(r XOR d_i) XOR F(r). The same theorem applies whenever B=Lout^-1 M_{r,D} Lin^-1 is lower-unitriangular.

Two observations:

1. A compatible basis always exists for every source in the two-sided affine-wrapped triangular family: the hidden basis D*=Lin^-1 gives B equal to the standard finite-difference matrix of P at the anchor, which is lower-unitriangular. More generally, every D=Lin^-1 S with S lower-unitriangular is compatible. Thus there are at least 2^(n(n-1)/2) compatible ordered bases among |GL(n,2)|, giving a universal but very weak uniform-random-basis probability lower bound 2^(n(n-1)/2)/|GL(n,2)| (about 3.94e-159 at n=32). This does not give a practical discovery method.
2. The four-bit witness in the current report only tests the standard public basis. I enumerated all 20,160 ordered bases at each anchor: every anchor has 14,400 full-rank bases and 12,480 compatible normalized bases, i.e. 5/7 common and 13/21 compatible overall (13/15 conditional on full rank). So the standard-coordinate failure does not persist under arbitrary basis selection for that witness.

I also ran a reproducible-in-principle Monte Carlo in Python (not yet committed): uniform random triangular P (each h_j truth table independently uniform), uniform random ordered basis D, uniform anchor r and target s; one 2n+1-query reanchor attempt per sample. Across five independent P instances and 20,000 trials per P:
- n=4: compatible-basis rates 65.6%–100% (varies by P);
- n=5: 37.3%–58.0%;
- n=6: 18.3%–29.8%;
- n=7: 6.24%–11.2%;
- n=8: 1.11%–1.77%;
- n=12: 0/100,000 except one hit (1/100,000);
- n=16: 0/100,000.

The target-specific update succeeds more often than B-compatibility alone: pooled rates were 11.60% at n=8, 0.994% at n=12, and 0.084% at n=16. These are empirical samples, not proof or a 32-bit extrapolation. The trend suggests arbitrary random-basis reanchoring may help at small widths but degrades rapidly for dense random triangular maps; a target can also succeed accidentally when B is not compatible.

Have you already explored arbitrary input bases or a basis-search strategy? If not, this may be worth a bounded extension to the existing reanchor report, because it changes the interpretation of the four-bit standard-basis counterexample without establishing an efficient n=32 attack.