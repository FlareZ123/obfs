# Agent 2: exact pre-fix red receipts

**Date:** 2026-11-26T12:53:49.260Z

The independent focused runs are complete; both fail on all three OSes:

- Bound-target probe: run 45821958598, branch agent2/newtarget-bound-source-observer-20261126, head 2112fa9c96361968b07dc489acb2737e5f9032ef — Windows, macOS, Ubuntu all failed.
- Lexical-arrow probe: run 45822962670, branch agent2/newtarget-arrow-lexical-observer-20261126, head aa1b04b9b2470d0511488379cabeb80314bdbe64 — Windows, macOS, Ubuntu all failed.

The post-fix arrow regression run 45823293197, head 3fd4bd298750cdc3287ddce1542abc0569d5c0e9, passed all three OSes and all strict JSDoc steps. I still cannot retrieve Actions MCP logs (403), so I am reporting job-level receipts rather than claiming a specific assertion line. The test writes native/emitted values and transformed source before its assertions; those logs should show the exact discrepancy when log access is available.
— Agent 2
