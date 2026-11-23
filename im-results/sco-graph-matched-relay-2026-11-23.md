# Multi-module SCO graph versus an equal-trust ordinary minified client

**23 November 2026. Agent 31. Classification:** intermediate adversarial and compatibility evidence; no release-security promotion.

## Frozen executable comparison

- Source/test: [test/sco-graph-equal-trust-relay.test.js](../test/sco-graph-equal-trust-relay.test.js), first committed at 'dcc4fc9dfede613aba2d0119057e26aa832076d6'; expanded with second-module and CPU controls through '4af4b60e2f40384d5c86b4713e88c4d1955b4883'.
- Completed focused validation: [Actions run 45181993083](https://github.com/FlareZ123/obfs/actions/runs/45181993083), **exact workflow source '8942e19d1f00509519f65f2d6460d85cc70af808'** (a later main commit which includes the test). Both Ubuntu and Windows focused test jobs passed; project, external and paired-budget JSDoc checks passed in both jobs. The complete Node/browser matrix was skipped by the focused workflow. Earlier test-only versions passed at [45181389502](https://github.com/FlareZ123/obfs/actions/runs/45181389502) and [45181674024](https://github.com/FlareZ123/obfs/actions/runs/45181674024).
- Test uses the existing [three-file real private ESM application](../examples/sco-graph/before/) and the production [SCO graph partitioner/handler](../src/sco-graph.js), with two generated public facades. Private module 'secret.mjs' performs 12,000 keyed HMAC rounds, 'api.mjs' exports 'derive', and 'audit.mjs' exports 'verify'.
- Control: ordinary esbuild-minified public ESM RPC facades for those same exports, pointing at a conventional authorized HTTP server which invokes the **same original ESM namespaces**, same randomly generated secret, same RPC method IDs and the same request token. The control's transport implementation is independently handwritten and simpler than createScoHandler. It therefore isolates the *authorized-relay outcome* under the same secret/authentication boundary; it is **not** a fully matched CPU implementation control.

## Tested attack and observations

A user controlling the legitimate Node ESM client replaces its fetch function and observes the emitted RPC method and JSON arguments from a genuine client call. This models the prompt's stronger client-inspection capability for SCO. The same observer is run against the checked-in generated SCO facade and the ordinary minified facade.

Under a randomly chosen private key and a single legitimate bearer:

1. Both HTTP services refused unauthenticated public-source reads, refused unauthenticated RPC posts and returned 404 for a request to the private dependency path.
2. Authorized HTTP reads of both public facades contained neither the source canary, private key text nor the private HMAC helper identifier. This is a bounded source-publication check, not a proof that memory instrumentation cannot inspect anything.
3. Actual client invocation exposed the corresponding method identifier and call input through intercepted fetch for **both** facades, with matching private HMAC results.
4. On **eight fresh random 128-bit inputs** in the live test, the captured method identifier and valid bearer reproduced the same 64-hex output through both servers. Both protected-graph and ordinary-baseline audit methods verified those responses, exercising the second private ESM entrypoint.
5. A request without the bearer was rejected with HTTP 403 on both servers. No private key was extracted by the test. It did **not** demonstrate a key-recovery attack or an offline functional clone.

This is an independently runnable same-account **online relay**, with the same observed success in the generated SCO and conventional minified arms. It does not negate genuine server-side code/key withholding or application-level account authorization, nor does it confer any extra public-facade anti-relay advantage in the tested scenario.

## CPU diagnostic and limits

After setup, the test makes **eight source-paired, alternating-order samples** of api.derive on the native original, real generated facade and conventional minified client. It records each process-wide user plus system CPU delta in milliseconds, per-input SCO/native, ordinary/native and SCO/ordinary ratios, and the count of strict measured SCO/native above 2.5 samples in the focused job output.

This measurement includes client and server executing sequentially in the same Node process over localhost. It does not separate browser CPU from server CPU or test WAN/TLS conditions. Server initialization is excluded from the sampled operation. **Passing the test does not assert that all samples are under 2.5x.** The raw arrays are retained in each job's stdout, rather than collapsed to medians; CPU logs were not independently extracted or adjudicated in this report. No universal performance compliance, compatibility, anti-modification, environment-lock or offline anti-cloning claim follows.

A future candidate would need the exact generated GET bytes and normal-control bytes frozen as attacker artifacts, a held-out post-shutdown clone attempt, independently collected client and server CPU plus negative-placebo measurements, and a source-coincident complete application/browser gate. Keep the primary research objective **RELEASE-BLOCKED** until it demonstrates a material attacker-cost advantage under those stricter controls.
