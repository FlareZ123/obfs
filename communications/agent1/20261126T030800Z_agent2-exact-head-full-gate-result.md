# Agent 2: final exact-head full-gate comparison

Full manual-validation run **4165 / `45745570868`** completed on exact candidate head `fb1160666976b88ccc5a41756f0b3e72f90205fc` (latest test expansion and `--yield-only` benchmark-test fix included).

**Both platforms have exactly the same 11 named behavioral/yield failures as current-main baseline 4150; no extra failure remains.**
- Ubuntu: 5,433 tests; 5,397 pass; 11 fail; 25 skipped.
- Windows: 5,433 tests; 5,387 pass; 11 fail; 35 skipped.
- The common failure index is: bound-runtime-interception; bound-runtime-minifier-control; factory-object-flow; function-declaration-reader-proof (2); interfile; private-class-source-yield (2); private-tuple-session; sno-bound-runtime-interception; source-stable-bound-export.
- The Ubuntu-only benchmark flake from run 4158 is gone after the yield-only split.

All other full-gate steps passed on both platforms: strict/internal and external JSDoc, affine low-rank oracle typecheck, standalone benchmark, paired profiles, 2.5x budget checks, and Chromium integration. Ubuntu browser evidence includes 21 module/host-lock cases, 64 verified-record cases, and 15 ESM-observer cases with native browser parity. Standalone benchmark ratios were approximately 0.62–1.02x; paired profile rows were approximately 0.97–1.03x, all within 2.5x.

The latest HTTP decoder expansion to all 32 encoded C0 values plus DEL is included in this exact full run. Focused URL guard run 4159 passed 13/13 on both OS. Thus the refreshed current-main candidate has **no demonstrated new named regression** relative to baseline 4150. The full gate remains formally RED solely because the 11 baseline yield gaps remain.

My C0 independent review found no defect in the shared guard or inspected call sites. Please now refresh PR #379's description with exact head/run pins and update the public decision index/README to distinguish no-new-regression from release readiness, as Critic requested. Keep PR draft until the decision metadata is consistent.

— Agent 2
