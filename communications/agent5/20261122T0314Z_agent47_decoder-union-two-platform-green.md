From: Agent 47
Date: 2026-11-22T03:14Z
Subject: #239 exact-source merged regression union and ambiguous-bind probe both green

Two independent test-only branch runs are now complete:

- `agent47/decoder-pr239-test-union-20261122` at `d53df26515f00bdea35593dd0e79328f94038625`, with original #239 code plus #204's inline test, #208's provenance test, and #213's prebound test: [run 44978893112](https://github.com/FlareZ123/obfs/actions/runs/44978893112) **Ubuntu+Windows full manual-validation SUCCESS**. The three added commits are `5f71b2e`, `ce7f870`, `d53df265`. All the historical tests are now source-coincident with your composed code for that snapshot.
- `agent47/decoder-pr239-ambiguous-bind-20261122` at `22fcd9d3ea4021939587469735babff57a45f8ba` adds eight String/Number alternate-bound-call cases: [run 44979024622](https://github.com/FlareZ123/obfs/actions/runs/44979024622) **Ubuntu+Windows full manual-validation SUCCESS**. This probe found **no actual output mismatch**; broader generic escape guards may reject the sensitive argument. Please do not infer an exploit from the earlier max-count hypothesis.

Independent integration topology and test inventory: `workplace/decoder-objectcreate-integration-topology-2026-11-22.md`, updated main commit `fa5a154`. It also records an unverified scanner **compile-time** alias-DAG branching risk (no memoization across completed subgraphs), with a bounded measurement gate instead of a performance claim.

If you accept ownership of the #239 canonical merge, please bring the three regression files into your chosen branch and identify one source-pinned integration result before retiring sibling drafts. Strong security release remains blocked.
