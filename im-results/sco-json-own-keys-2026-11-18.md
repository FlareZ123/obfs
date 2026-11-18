# SCO explicit JSON own-key admission, 18 November 2026

**Classification:** intermediate server-side wire-shape correctness hardening. This result neither establishes an authorization boundary against a compromised trusted server nor adds client-side obfuscation secrecy.

## Real-HTTP red control

The old `src/sco.js` validated `typeof query.method==='string'` and `Array.isArray(query.args)` without requiring those properties to be **own** members of the parsed JSON object. Native parsed JSON objects inherit from `Object.prototype`. If a trusted server dependency had added `Object.prototype.method='read'`, an HTTP payload `{"args":[5]}` lacking its own method could invoke the registered `read` operation. Likewise, inherited `args=[5]` could supply the array missing from `{"method":"read"}`.

`src/rpc-batch.js` and `src/rpc-batch-policy.js` also admitted a batch member with inherited method/arguments because their validation used ordinary property access. Any server-side prototype pollution that supplies those values can silently undermine a wire-shape admission assumption.

The new [`test/sco-owned-json-shape.test.js`](../test/sco-owned-json-shape.test.js) includes four cases: real HTTP missing own root method, missing own root argument array, recognized batch member missing own method, and synchronous `preflightScoBatchState` missing own method. Each uses a controlled temporary `Object.prototype` fixture restored after its test and checks that a properly specified ordinary or batch request still works. Prior branch [`a640f42`](https://github.com/FlareZ123/obfs/commit/a640f42db29185f84ee85b2ed34cc74bb5536a96) failed **exactly all four newly introduced tests** on Ubuntu and Windows in [red run 44249981944](https://github.com/FlareZ123/obfs/actions/runs/44249981944).

## Repair and verification

Require `Object.hasOwn(query,'method')` and `Object.hasOwn(query,'args')` before dispatching a registered RPC. Apply equivalent own-key requirements to recognized inner batch calls and the synchronous preflight batch policy. Retain existing value type and registered method checks, preserving explicit allowed own JSON values.

The fixed source at [`966076c`](https://github.com/FlareZ123/obfs/commit/966076c54de4e552f9678497f286f5bffb9d8067) passed the full targeted SCO authorization matrix and strict JSDoc checks on Ubuntu and Windows in [green run 44250183249](https://github.com/FlareZ123/obfs/actions/runs/44250183249). [PR #89](https://github.com/FlareZ123/obfs/pull/89) merged to `main` at [`d8fc6319`](https://github.com/FlareZ123/obfs/commit/d8fc6319d9778ab53b272aa680c256c604d975d8).

## Boundary and performance limits

This is a specific JSON transport contract: applications must explicitly transmit `method` and `args` on root calls and each recognized batch member. It refuses previously accidentally admitted malformed envelopes. It assumes the trusted server has not been compromised and cannot prevent direct monkeypatching of request handlers by a server administrator or runtime owner. No independent per-call budget timing was collected for the extra own-key checks. The project's strong-obfuscation release decision remains blocked.
