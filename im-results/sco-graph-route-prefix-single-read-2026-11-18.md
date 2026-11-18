# SCO graph route-prefix option provenance: single-read HTTP compatibility

**Date:** 2026-11-18 UTC  
**Mode and owner:** normal research, Agent 18  
**Scope:** trusted-server construction of `createScoGraphHandler`, Node 22 on Ubuntu and Windows. This is a startup configuration and compatibility correction, with no measured request-time transform cost or anti-cloning claim.

## Reproduced failure

Prior `src/sco-graph.js` checked `(options.routePrefix??'/obfs/')+'rpc'` when validating compiler-generated facade endpoints, then later spread `...options` into `createScoHandler`. An enumerable getter returning `'/obfs/'` on its first read and `'/moved/'` on its second read passed endpoint admission and caused the generated facade and handler to disagree about the mounted RPC route. This option drift was first reported independently by Agent 35 in `communications/agent18/2026-11-17T0903Z_agent35_sco-graph-routeprefix-snapshot.md`.

A minimal HTTP regression in `test/sco-graph-private-path-policy.test.js` requires exactly one read, a `200` GET for the generated facade, and a successful RPC `POST` on the route advertised by the facade.

- **Pre-fix red:** [workflow 44279439494](https://github.com/FlareZ123/obfs/actions/runs/44279439494) at [commit 2bdcbfc](https://github.com/FlareZ123/obfs/commit/2bdcbfcac2c56991240d18725af7f9f67e721480) failed the new test on both OSes. This first version's cleanup masked the precise assertion with `ERR_SERVER_NOT_RUNNING`; the assertion was moved outside the server cleanup in a subsequent test revision.
- **Enumerable-getter green:** [workflow 44279623511](https://github.com/FlareZ123/obfs/actions/runs/44279623511) at [commit 2a2034e](https://github.com/FlareZ123/obfs/commit/2a2034e32eb937aba920d3b4ce5ef8f302c3ba90) passed on both OSes with the initial `stableOptions={...options}` capture.

## Second compatibility boundary

The original and initial-spread implementations lose the configured route when it is an inherited or non-enumerable accessor. ECMAScript object rest/spread copies own enumerable properties and excludes inherited and non-enumerable members. Consequently, the initial spread capture incorrectly compared the compiler's `'/private/rpc'` endpoint against the default `'/obfs/rpc'` for those legitimate option objects.

The new HTTP test covers **both** non-enumerable own and inherited non-enumerable `routePrefix` accessors. It verifies one getter read, `200` for the custom module GET route, `404` at the default route, and authenticated RPC semantic parity.

- **Before final fix, red:** [workflow 44280124934](https://github.com/FlareZ123/obfs/actions/runs/44280124934) at [commit 6dad031](https://github.com/FlareZ123/obfs/commit/6dad031adab6b1a05ca289782d24ccb1637651b5) failed on both Ubuntu and Windows with `SCO graph RPC endpoint does not match routePrefix: remote.mjs`.
- **After final fix, green:** [workflow 44280176674](https://github.com/FlareZ123/obfs/actions/runs/44280176674) at exact [commit 53e8e3e](https://github.com/FlareZ123/obfs/commit/53e8e3ef8687654c897fc9395c6a0537c8837b01) passed the **15 SCO graph tests per OS**, the generated graph check, and strict JSDoc. Both jobs succeeded.

## Implementation

At construction, `createScoGraphHandler` now destructures `const {routePrefix,...remainingOptions}=options`, then forms `stableOptions={...remainingOptions,routePrefix}`. The value is read once through ordinary JavaScript `Get` semantics regardless of own-property enumerability or prototype ownership, and that same captured value drives both expected endpoint comparison and `createScoHandler`.

Only server initialization changes; the existing per-request routing logic is untouched.

Reference: [ECMAScript 2026 CopyDataProperties](https://tc39.es/ecma262/2026/multipage/abstract-operations.html) and [MDN object initializer spread semantics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer).

## Limits and next checks

This is a reproducible safety-of-configuration and compatibility result for supported option shapes. A malicious integrator with arbitrary trusted-server execution can replace the handler or its code, and an authenticated client can still relay outputs. There is no claim of cryptographic code protection, hostile-server security, or universal 2.5× runtime compliance.

Two related selective-SCO constructors currently use `stableOptions={...options}`: `createScoSelectedHandler` in `src/sco-selective-partition.js` and `createScoSelectedGraphHandler` in `src/sco-selected-graph.js`. They already solve enumerable getter drift; the inherited/non-enumerable option compatibility edge should be independently checked with their own public HTTP tests before any related change.
