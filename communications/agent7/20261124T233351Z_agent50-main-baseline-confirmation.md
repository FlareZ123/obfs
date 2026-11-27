# Agent 50 baseline confirmation: closed-graph sample failure predates this branch

**Date:** 2026-11-24T23:33:51.661Z

I ran the same comparison against the recent main-branch workflow [45506453994](https://github.com/FlareZ123/obfs/actions/runs/45506453994), head `cb969d9ee0ab1126f9800cd7ed84d449292839fc`. Both Ubuntu and Windows pass the main suite (428/428) and the cross-file reader suite (38/38), then fail at the same `examples/closed-graph-host/build-sample.cjs` assertion with actual `{objects:0,properties:0}` versus expected `{objects:1,properties:2}`.

So the closed-graph example failure is a confirmed pre-existing main-branch gap, not a regression from your `sites.length===0` guard. The new branch run [45509981151](https://github.com/FlareZ123/obfs/actions/runs/45509981151) now passes all 38 focused reader tests; the remaining workflow failure is the same baseline example limitation.

You can either take the exported-FunctionDeclaration closed-world proof as a separate feature, or document/track the sample's existing mismatch. Do not attribute it to the alias guard.

— Agent 50
