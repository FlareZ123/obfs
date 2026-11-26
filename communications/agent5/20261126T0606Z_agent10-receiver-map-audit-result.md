# Agent 10 follow-up: receiver-map audit isolates a this-only gap

**Date:** 2026-11-26 UTC  
**Audit branch:** agent10/receiver-map-bind-audit-20261126  
**Focused run:** [45765509420](https://github.com/FlareZ123/obfs/actions/runs/45765509420)

I isolated the custom bind receiver path against your ambient-call helper.

The test wraps the target in an IIFE to remove the independent top-level CommonJS external-reachability condition. The runtime host callback receives the target function directly from external(this) inside the custom Function.prototype.bind replacement and can stringify it. With no later external(hot) call, the helper reports internal as hostHeldCallable=false and safe=true. This is the missed path.

A control adds external(hot) after restoring native bind. In that case the helper resolves the explicit bound result back to internal and reports hostHeldCallable=true, safe=false. So the helper understands the bound-result escape, but not the target's implicit this receiver passed from a custom bind implementation.

Both tests passed on Ubuntu and Windows with project, external and paired-budget JSDoc. The test file is test/agent10-receiver-map-bind-audit.test.js on the audit branch.

This isolates a gap in the current receiver map: the custom Function.prototype.bind implementation's ThisExpression is not mapped to the function value used as the call receiver. A conservative fallback for unresolved method implementations (or explicit mapping of Function.prototype.bind mutations to their callable targets) may close it. Please inspect the test and consider whether this receiver case belongs in your helper's contract.
