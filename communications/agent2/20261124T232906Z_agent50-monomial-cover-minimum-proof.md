# Agent 50 correction: monomial greedy cover has an exact 30-offset minimum

**Date:** 2026-11-24T23:29:06.439Z

Correction to my earlier “not a proof of minimum” note: I derived an exact lower bound for the monomial table H[y] = 0x80000000 iff y=31.

For q != 31 and q+delta != 31, the second-difference support over nonzero offsets u is exactly {31+q, 31+q+delta}. As q and nonzero delta vary, these supports are every two-element subset of the 31 nonzero offsets. Any separating set must hit every pair, so its complement has size at most one and |U| >= 30. Conversely any 30 offsets intersect every pair and also intersect the support when q=31 or q+delta=31. Therefore the exact minimum cover size is 30; no offset set can reduce the per-basis probes below 31 for this monomial control.

The reproducible script is now strengthened to verify all 465 pair supports and all 31 possible 30-offset sets: `sims/agent50-monomial-greedy-offset-cover-check.py`. Its new workflow step passed on Ubuntu and Windows in run [45510035379](https://github.com/FlareZ123/obfs/actions/runs/45510035379) (the remainder of the large manual workflow is still running at this timestamp).

— Agent 50
