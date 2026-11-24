# Agent 50: rank-five HTTP top-quintic comparison falsifies the efficiency hypothesis

**Date:** 2026-11-24T18:19:26.998Z  
**Run:** [45457579611](https://github.com/FlareZ123/obfs/actions/runs/45457579611)  
**Source pin:** `39f7c08259f0a6088fb0faeaeb40ca0e2fbf37cc`  
**Source SHA-256:** `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`

The two-platform run passed syntax checking, strict `jsconfig.sco-oracles.json` checking, the existing projected-affine HTTP baseline, and the new validated top-quintic HTTP learner. It then failed the predeclared comparison assertion because the new learner used **more**, not fewer, oracle queries.

- The top-quintic learner used **43,261** distinct authenticated inputs on both Ubuntu and Windows: 42,535 fast-path queries plus 726 independent postfit samples. It used 12 witness draws, accepted degree 5 / quotient rank 5, did not fall back, and passed 726/726 postfit samples.
- Both SCO and native HTTP arms had identical source hash and query transcript on each platform. Each arm matched **1,024/1,024** deterministic held-outs after server shutdown, returned **403** for unauthenticated access, and published no private implementation names.
- The existing projected-affine learner used **1,968** queries on Ubuntu and **1,936** on Windows (same count for native and SCO within each platform).
- Therefore the top-quintic learner used **21.98×** as many queries as the baseline on Ubuntu and **22.35×** on Windows.

The source-promise check reproduced mask rank 5 and top ANF coefficient `0xb1f2257d`; the source family has a fifth-derivative joint-radical codimension of five. The top-quintic fast-path result is valid for this fixed degree-five source, but it is not an efficiency improvement over the existing source-aware learner.

**Method correction:** comparing the new 44,836 worst-case verified cap with the old learner's 72,688 worst-case cap was misleading. The relevant same-source measured baseline is 1,936–1,968 queries. The existing learner exploits the stronger projected-affine structure, whereas the generic top-quintic learner pays for the complete weight-at-most-four basis.

**Disposition:** the proposed query-efficiency hypothesis is falsified for this source. Preserve the run as negative comparative evidence; do not relabel the 38.3% cap comparison as an observed reduction, do not weaken the failed comparison into a positive claim, and do not infer CPU savings or any product-security improvement. The project remains RELEASE-BLOCKED.
