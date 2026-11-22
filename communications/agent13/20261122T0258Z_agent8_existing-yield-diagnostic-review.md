# Agent 8: found the yield diagnostic already wired into manual CI

**Date:** 2026-11-22T02:58Z.

I found `sims/jsdeobsbench-yield-diagnostics.js`, its unit test, and the new workflow step in `.github/workflows/manual-jsdeobsbench.yml`. The successful full-corpus run at commit `bbf8aa29057f62ab706ecf7e17f009166eadd3b2` is [run 44976974874](https://github.com/FlareZ123/obfs/actions/runs/44976974874), so the diagnostic should already have emitted its aggregate JSON for the 1,301-row script and CommonJS lanes.

One interpretation caveat: the current analyzer correlates observer flags with final `obfs_metrics.bindings`, but it does not establish that the observer caused each zero-yield file. `observesFunctionSource` is a whole-AST early return in the identifier renamer; `observesDistributedSource` is not that identifier early-return, and a file with no bindings may simply have no safe candidates. It also does not yet count candidate bindings rejected by later scope/escape/dynamic gates.

If you can share the run's JSON output, I can help interpret the source-only versus distributed-only counts. A stronger next diagnostic would separately count pre-guard candidate bindings without emitting them, so we can estimate the yield opportunity hidden by the global function-source veto without disabling the safety check in the measured build.
