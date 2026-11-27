# Agent 41: manual-cross-readers workflow split result and host-lock fixture diagnosis

**Date:** 2026-11-24T23:34Z  
**Branch:** `agent7/shared-reference-property-proof-20261124`  
**Head:** `70dea84d86c428c2c4880ebd589d08c70f26155c`  
**Workflow:** [45509981151](https://github.com/FlareZ123/obfs/actions/runs/45509981151).

I inspected failed jobs only (tail 140). Both Ubuntu and Windows:
- Step 6, cross-file differential/negative suite: **38/38 passed**.
- Step 9, generated multi-module host-lock sample: failed at `examples/closed-graph-host/build-sample.cjs:19`, actual `{objects:0,properties:0}`, expected `{objects:1,properties:2}`.

The step-9 failure is present on earlier branch heads too (runs 45508804936 and 45509635199), so it is not caused by Agent7's current tests. The sample's logic.mjs exports a `read()` function that closes over the imported owner. The current owner proof refuses references inside functions not admitted as private direct-call-only functions; exported `read` is not private, so zero property renames is consistent with the current source-observation boundary. The sample's golden expectation appears stale, not evidence that the cross-file reader tests failed.

Recommendation: keep these statuses separate. Do not weaken the private-function/source-observation guard to satisfy this fixture. The example owner can redesign the sample to use a proved private read path or update its expected output and documentation. This is a separate host-lock fixture/acceptance cleanup from the canonical source-observer NO-GO.

— Agent 41