# SCO request-policy configuration snapshot and receiver semantics

**Author:** Agent 5. **Date:** 2026-11-16. **Status:** Bounded engineering hardening and real-HTTP regression evidence. No adversarial server-compromise resistance claim.

## Observed configuration drift

The Node SCO handler previously closed over the mutable caller-owned `options` object. Each HTTP request read `options.allowedHosts`, `options.authorizeRead`, `options.authorizeRpc`, `options.authorizeOperation`, `options.remoteMethods`, `options.maxRpcBytes`, and `options.runRpcIsolated` again. Therefore a trusted application mutating its config object after handler construction could silently:

- replace a denied `authorizeRead` callback with an accepting one;
- change the list of accepted HTTP `Host` header strings;
- replace server-resident RPC methods with new implementations; or
- relax operation-level or request-size policies.

None of these is a direct exploit under the SCO threat model of an uncompromised server: the attacker cannot mutate the trusted server's Node objects. This is an important operational integrity and accidental misconfiguration boundary, complementing the earlier explicit `publicPaths` publication control and Buffer asset snapshots.

## Implementation and compatibility

`src/sco.js` now creates a handler-private `policy` object at startup, captures callback references, copies the allowed host array, and captures registered remote operation methods. It uses this private copy for all subsequent routing and authorization decisions. The original callbacks remain live functions, so a legitimate application's session database/keyring can be rotated by changing state *inside* the captured callback without replacing the trusted callback itself.

There is a subtle JavaScript compatibility constraint: the existing RPC dispatcher calls `registry[method](...args)` with the **original operation registry object as `this`**. A naïve shallow copy of the registry changes that receiver, breaking stateful functions. The final change captures each callable method with `method.bind(originalRegistry)`, retaining its original receiver identity while fixing the method's code reference at handler construction. Original receiver state may still change as part of the server application's intended stateful behavior. This guarantee concerns ordinary calls; it is not a proof that introspection on function identity, bound function names, stack traces or self-reference remains identical under all JavaScript metaprogramming.

A special note for the security interpretation: clients can forge HTTP `Host`, so the routing check still cannot serve as authentication. Only server-resident authorization callbacks can enforce client access; their policy quality depends on the integrator. Full server-runtime attackers can replace the handler and are out of the SCO threat model.

## Reproduction

[Real HTTP regression](../test/sco-policy-configuration-snapshot.test.js) initializes a handler with a denied read policy and approved host. It then changes the caller's host array and options fields before GETs. The original policy is still applied. A separate POST RPC test swaps the registry methods and the authorization callback and checks that the immutable operation definition returns its original value, that unknown operations remain absent, and that `this` is the original object. A third test rotates a captured callback's external `authorized` boolean and verifies both denial and later legitimate admission.

Validation: [focused SCO gate 43806111772](https://github.com/FlareZ123/obfs/actions/runs/43806111772) passed Ubuntu and Windows for the initial policy-snapshot implementation (without explicit original-`this` capture regression). The subsequent [focused run 43806290857](https://github.com/FlareZ123/obfs/actions/runs/43806290857) was dispatched after adding bound original-registry methods and exact receiver preservation test; its result must be checked before marking this final version validated. The report is an intermediate engineering result rather than an established security theorem.

## Performance and threat boundaries

Config copies and method binding happen once when constructing the trusted SCO handler. They add no per-request transform, only the existing function call through one bound callable. No session-level 2.5× performance guarantee is inferred. A benchmark of the RPC path would be required to quantify any repeated-call overhead. This patch primarily reduces application error and configuration drift under trusted server operation, while leaving unlimited authorized online relaying and full-control COO/SNO reconstruction unchanged.
