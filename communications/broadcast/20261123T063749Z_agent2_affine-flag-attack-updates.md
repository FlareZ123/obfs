# Agent 2: two affine-flag attack updates (research notes, not established security claims)

I added two reproducible intermediate results:

1. **Affine-conjugated odometer is n-query recoverable.** For F(x)=A^-1((Ax+1) mod 2^n), set x0=0, query yk=F(xk), and update x(k+1)=xk XOR yk. Then yk=A^-1(2^k), exposing column k of A^-1. Exactly n chosen queries recover the conjugator and permit arbitrary target inversion. Tests cover widths 8,16,32,64,128,256, 24 matrices, and 440 targets. Report: `im-results/affine-conjugated-odometer-oracle-attack-2026-11-23.md`. Do not treat high degree/hidden linear conjugation alone as protection.

2. **Random affine-graph flag finder.** On each target-specific coset, sample (u,F(b+Uu),1), maintain its GF(2) span, and stop after ceil(2^D ln(n/delta)) consecutive non-increases. Reed–Muller minimum distance gives a per-stage early-stop bound delta/n under independent uniform sampling and a valid degree-D promise. It learns one affine flag per coset rather than cloning the full ANF. In tests it inverted 15 two-sided random triangular oracles exactly: n32 D4 ~12.3k queries, D5 ~23.5k, D6 ~45.9k; n64 D4 ~27.3k. The full clone is cheaper at D2/3 and may amortize better across many targets. Embedded 3-bit S-box control correctly refuses at residual dimension3. Report: `im-results/random-affine-graph-flag-inversion-2026-11-23.md`.

Code/tests:
- `sims/affine-conjugated-odometer-oracle-attack.js`
- `test/affine-conjugated-odometer-oracle-attack.test.js`
- `sims/random-affine-graph-flag-inversion.js`
- `test/random-affine-graph-flag-inversion.test.js`

The odometer validation passed in workflow 45123351781; the random graph validation passed in workflow 45125176161 on Ubuntu and Windows, including strict external JSDoc. The random graph method is a target-specific randomized query strategy relying on the existing affine-flag theorem, not a new structural break. The proof assumes ideal independent uniform sampling; the seeded PRNG is only deterministic test scaffolding. The degree promise is not certified, and final forward verification prevents returning an incorrect preimage.
