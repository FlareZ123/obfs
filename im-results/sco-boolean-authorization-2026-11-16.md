# SCO exact-boolean authorization: real HTTP red/green policy-contract regression

**Status:** bounded trusted-server authorization contract repair; not an obfuscation secrecy result.

## Finding

The three `createScoHandler` authorization callbacks are JSDoc-declared to return `boolean|Promise<boolean>`. Before repair the HTTP code used JavaScript truthiness, so a mistaken callback such as `authorizeRpc: async request => ({authenticated:false})` still authorized the caller because the returned object is truthy. The same ambiguity occurred for `authorizeRead`, `authorizeOperation` (outer and recognized-batch inner methods), and the coarse gate inside an isolation callback.

This is an **integration-misconfiguration** counterexample, under a trusted server where an application author supplies a wrong return type. It is not an attacker override of trusted JavaScript or evidence that an otherwise correct verifier can be bypassed.

## Native HTTP negative controls

New `test/sco-boolean-authorization.test.js` sends actual loopback HTTP requests to the handler and checks:
1. Coarse RPC callback returning number, string, object, `new Boolean(true)`, and an asynchronously resolved object must deny private calls and produce no private effects.
2. The isolated coarse RPC gate must also deny an object-valued result.
3. The outer operation callback must refuse a truthy string.
4. A recognized batch with boolean-approved outer route and object-valued inner authorization must refuse all work.
5. The GET source-read callback must refuse numeric, object and async string results.
6. As a positive compatibility control, both synchronous and asynchronous literal boolean `true` authorize exactly one RPC and a source-read request.

Pinned pre-repair workflow [43955374054](https://github.com/FlareZ123/obfs/actions/runs/43955374054), exact SHA `c941836a272907af62f3622cc544296f9012e1d3`, failed **five of the six new HTTP assertions on both Ubuntu and Windows**, while the explicit-boolean positive passed. The existing targeted SCO test set had 149 tests total, with 144 passes/5 failures on Ubuntu and 143 passes/5 failures/one skip on Windows.

## Repair and migration

`src/sco.js` now requires `(await authorizeRpc(...)) === true`, `(await authorizeOperation(...)) === true`, and `authorizeRead` resolution `=== true`. Every other return value denies with HTTP 403. Exceptions are still suppressed as generic HTTP 500. The same equality is enforced before and inside isolation and for every recognized batch member. The code performs one strict primitive comparison per authorization result. `docs/SCO_AUTHORIZATION.md` documents the revised contract and migration for verifiers returning principal objects: explicitly convert a validated result to boolean, e.g. `Boolean(await verifyUserSession(request))`.

This changes previously accepted truthy-return behavior and can break integrations that knowingly relied on returning session objects. It is intentional fail-closed hardening for the declared Boolean API. It cannot protect against a faulty callback that directly returns literal `true` for an unauthorized request.

## Validation and security-performance boundary

The red control proves the old code admitted the five unsupported return shapes. A green patched cross-platform source-pinned workflow must be recorded separately. The previous SCO async-transition gate [43954881123](https://github.com/FlareZ123/obfs/actions/runs/43954881123) predates these changes. No whole-session 2.5× runtime guarantee or hostile-server compromise resistance follows from this authorization contract change. Client reconstruction, unlimited authorized querying, and credential theft are unaffected.
