# SCO batch wrapper identity preflight bypass

**Agent:** Agent 3  
**Date:** 18 November 2026  
**Classification:** intermediate security/correctness evidence. This is a negative control for the current SCO batch authorization boundary, not a release candidate and not an obfuscation-strength claim.

## Finding

`createScoBatchMethod` records the exact returned function object in the private `recognizedBatches` WeakMap. `createScoHandler` discovers inner batch operations by calling `getScoBatchCalls(task,args)`. A bound, proxied, or forwarding function can still invoke the legitimate batch helper while having a different function identity. The discovery result is then `null`, so the HTTP handler treats the route as an ordinary direct RPC and does not run per-item `authorizeOperation` checks.

This is a fail-open policy boundary for integrations that wrap an otherwise legitimate `createScoBatchMethod` before placing it in `remoteMethods.batch`.

## Reproduction

Source-pinned executable negative control:

- source commit adding the witness: `25e2cdfc4e20d8ffcb3c0c46fb96ab52ae9675d8`
- CI gate commit: `3b7141cd85f00bf6648a694f6564949703227cae`
- script: `sims/sco-batch-wrapper-preflight-attack.js`
- workflow: `.github/workflows/manual-sco-authorization.yml`
- workflow run: https://github.com/FlareZ123/obfs/actions/runs/44407442760

The harness starts an actual loopback HTTP SCO handler. Its outer authorizer permits only the route name `batch`; any inner `forbidden` operation must be denied. The exact helper correctly reaches the inner authorizer and returns HTTP 403 with zero private effects. Three behavior-preserving wrappers reach only the outer authorizer, return HTTP 200, and execute the forbidden private effect once:

| Registered task | HTTP | Private effects | Observed policy methods |
| --- | ---: | ---: | --- |
| exact `createScoBatchMethod` result | 403 | 0 | `batch, forbidden` |
| `batch.bind(null)` | 200 | 1 | `batch` |
| `new Proxy(batch,{})` | 200 | 1 | `batch` |
| `calls => batch(calls)` | 200 | 1 | `batch` |

Both Ubuntu and Windows Node 22 produced the same witness output. In run `44407442760`, the dedicated negative-control step succeeded on both platforms. The entire Windows job then completed successfully, including strict source and external JSDoc checks. Ubuntu later failed in the pre-existing IPv6 Chromium check because that browser fixture remained at `pending` instead of producing `[::1]|42`; the wrapper witness itself had already passed.

## Scope and relation to the immutable-batch draft

The current-main issue does not require `immutableBatchArgs`. It arises from exact function identity being used as the security discovery boundary.

Draft PR #134 additionally computes its immutable-batch activation from the same `getScoBatchCalls(task,args)!==null` predicate. A wrapper therefore also silently prevents the opt-in frozen/shared inner graph from activating, while the wrapped helper still executes. This should block a claim that wrapped batch helpers retain the registered helper's inner-policy contract.

## Repair direction

Generic JavaScript wrappers cannot be reliably reverse-mapped to their target after construction. A robust design should make the supported provenance boundary explicit.

One conservative repair is to fail closed when a route is configured as a protected SCO batch but its registered task does not carry recognized batch provenance, and to provide an explicit wrapper-registration API if wrapped helpers are intended to be supported. A blanket ban on every ordinary RPC method named `batch` may be compatibility breaking, so the API contract should distinguish a protected batch route from an arbitrary direct method before enforcing the rejection.

Until that contract is selected and independently tested, keep the executable witness as a release-gate negative control and do not infer inner authorization from a route name alone.
