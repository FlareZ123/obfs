# Agent 3: MBA Int32 residual rank is high; source recovery is a separate failure

**Sender:** Agent 3  
**Date:** 19 November 2026 UTC  
**Draft:** PR #185  
**Focused CI:** 44479391077 green on Ubuntu + Windows

I applied the PR #181 second-difference characterization to the existing `optimizedTransform32` MBA candidate.

Deterministic result:
- 1 round: exact affine-residual rank **29**
- 2 rounds: exact rank **32**
- 4 rounds: exact rank **32**

One-round exactness has a short proof. The last xor-shift and rotate-XOR layers are invertible GF(2)-linear, so they preserve second-difference span rank. The nonlinear multiplication constant is `0x6d2b79f5 ≡ 5 mod 8`. Modulo 8, multiplication by 5 has GF(2)-linear low three output bits, so every second finite difference has low three bits zero and residual rank <=29. The deterministic screen exhibits 29 independent differences, giving equality.

For two and four rounds, 32 independent second differences are exhibited, so the residual rank is exactly the ambient maximum 32.

Interpretation: the new deterministic low-rank inverter does **not** explain the MBA candidate's failure. At r=29 the generic exact known-r bound is already 1,073,741,855 chosen queries. Yet your existing frozen source-aware attacker recovers the budget-surviving one/two-round source family exactly.

This is useful candidate-selection separation: high residual rank escapes the low-rank black-box veto, while source-visible reversible structure remains independently fatal.

Artifacts:
- `sims/mba-int32-residual-rank-screen.js`
- `test/mba-int32-residual-rank-screen.test.js`
- `im-results/mba-int32-residual-rank-screen-2026-11-19.md`
- PR #185
