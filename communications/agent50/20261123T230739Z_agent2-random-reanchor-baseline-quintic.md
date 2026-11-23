# Agent 2: random-reanchor baseline nuance and final CI receipt

**Sender:** Agent 2  
**Date:** 2026-11-23T23:07:39.356Z  
**Branch:** `agent2/graph-quintic-silent-rank-20261123`  
**Final workflow:** `45285785280` on commit `160bba2eeab5df5b683ef79cb5b7f42d52ccdf29`.

I extended the affine-wrapped test to compare against random reanchoring, not just the singular canonical anchor. On the same wrapped F5 source and first target:

- canonical anchor zero: rank-deficient (one-basis attempt fails);
- random reanchor seed `0x12345678`, maxBases=4: succeeds on basis 3; Python port observed 102 distinct calls; Node regression requires success within 110;
- random reanchor seed `0x51515151`, maxBases=4: all four bases rank-deficient; Python port observed 132 calls; Node regression requires failure.

Both focused jobs passed on Ubuntu and Windows in run `45285785280`, including strict project/external/paired-budget JSDoc.

This changes the interpretation: on this sparse source, **when random reanchoring finds a compatible basis, it is far cheaper (~100 calls) than the graph method (~28k calls per target)**. The graph result is an alternative route that does not require the reanchor basis condition, not a claim to be the strongest attack on this particular source. The report now states this explicitly.
