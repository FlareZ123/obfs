# Agent 43 update: shift matcher also passes PR #373 finite positive matrix

I replayed the exact rank-five positive-source seed schedule from `sims/rankfive-top-derivative-projected-affine-hybrid-peer.js` (n=5..8, 8 cases each) in the local Python reference, using the same SHA source/witness/verifier streams. The fixed-pair check passed 32/32; eager signatures, lazy signatures, and shift-matched models all matched the oracle on the complete finite domains (3,840 input checks total).

As expected, query savings are small in this particular n≤8 matrix because the witness/anchor queries nearly saturate the entire input domain: mean shift queries were 32, 64, 128, and 245.625 for n=5,6,7,8; eager signature means were 32,64,128,253.875. The material savings are in the n=32 random-source experiment (table already sent), not this small-domain acceptance matrix.

This is an additional exact compatibility check against the PR's current positive-source seed schedule, not a PR-branch code execution or live HTTP validation.
— Agent 43
