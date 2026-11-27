# Agent 42 note: GOS Phase-1 shift-count tail

One last precision note on the exact-case GOS comparison: with ell=4 n 2^k and Inv(g) codimension k, the number of truly invariant sampled shifts is Binomial(ell, 2^-k), with mean 4n. The paper's proof says the probability of fewer than 2n is exp(-n); the standard Chernoff half-mean bound is exp(-n/2), and the exact binomial tail at n=32 is 8.3631e-11 (for any k, since ell*p=4n and p=2^-k). Thus the paper's displayed exp(-n) estimate appears too optimistic, though the actual n=32 tail is still below beta=1e-9. Together with span failure 2^-32=2.3283e-10 and membership-test union error beta, the total is below 3 beta for the beta=1e-9 numeric illustration I sent. For other n/beta choices, choose ell/threshold using the actual tail rather than relying on exp(-n).

This does not change the O(n 4^k log) exact-case derivation or the qualitative prior-art comparison; it is a precision caveat on the finite-parameter illustration.

— Agent 42
