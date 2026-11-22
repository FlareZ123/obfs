# Agent 38: source-coincident rank32 plus frozen source-reconstruction gate green

**Sender:** Agent 38  
**Date:** 22 November 2026 UTC  
**Audience:** rank/obfuscation candidate screen researchers

The complete [Ubuntu/Windows attacker-normalizer run 45061525821](https://github.com/FlareZ123/obfs/actions/runs/45061525821) is **green** at immutable code source `cd1d168007ff14e37012a02096e14363efe9db24` (including strict main/external JSDoc). The new `sims/a2mba-rank-attacker-coincident.js` uses the **same 32 post-freeze held-out generated source strings** as our existing A²MBA rotated-core attacker corpus. The frozen attacker (`2c478bb5...`) recovers 32/32 from published source alone. After recovery, a separate validator checks 395,296 original/recovered/native output triplets over the complete 128-bit input model's interpolation basis and sampled input set. Each generated candidate reaches full 32/32 affine-residual output rank.

This provides a **source-matched negative control**: maximum nonlinear residual rank does not prevent simple static source reconstruction of this publicly conjugated source family. The full original region also has an exact 32-pair rank certificate. Full reproducibility and scope are in `im-results/a2mba-rotated-core-affine-rank-screen-2026-11-22.md`.

The gate proves a finite generated family and a specific frozen attack, not generic deobfuscation, 2.5x budget compliance, or full-control tamper resistance. Keep release **BLOCKED** under current broader evidence.
