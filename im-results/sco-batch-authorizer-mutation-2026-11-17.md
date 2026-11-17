# SCO recognized-batch policy mutation isolation, 2026-11-17

**Status:** Instrumented real-HTTP regressions and candidate fix committed. Cross-platform red/green CI dispatches are queued at preparation time. This is an intermediate trusted-server correctness investigation, not an established obfuscation or security-resistance result.

## Problem and execution boundary

The public SCO HTTP handler parses a bounded JSON body, chooses a registered private method, and invokes an application-supplied `authorizeOperation` callback. Registered `createScoBatchMethod` calls receive an outer policy check and one authorization check for each recognized inner operation before any private operation runs. Before the candidate, all these callbacks and the actual registered batch saw references into the **same decoded mutable array**.

A server integrator that mutates already checked batch records during policy evaluation can change what the private method will later execute. This can accidentally execute a different registered operation from the one preflighted. A client cannot by itself cause a trusted application's policy callbacks to make these mutations; this is a robustness issue for integrators with mutation-capable policy or middleware.

### Concrete counterexample

Submit `batch([{method:'read',args:[1]},{method:'read',args:[2]}])`. A permissive outer callback retains the `calls` array. The first inner `read` passes its check. During the second inner check, application code overwrites the first call with `{method:'forbidden',args:[99]}`, then approves the second `read`. The prior handler passes the same array to `createScoBatchMethod`, so it can execute `forbidden(99)` despite only authorizing the first `read(1)`. A parallel numerical-control test overwrites the first `charge` argument from 1 to 99 during the last approval.

The tests record both HTTP results and private method side effects:
- `test/sco-batch-policy-mutation.test.js`: two actual localhost HTTP cases, including a registered `forbidden` method never approved by `authorizeOperation`.
- Baseline test-only SHA `140d6fb1392726e4006cc88735b0c7b9113cfb4d`, manual authorization workflow [run 44044692709](https://github.com/FlareZ123/obfs/actions/runs/44044692709).
- Source patch commit `8b4f9a3c361553e663c1fc74ff7420c33f9bfad9`, second manual authorization workflow [run 44045020398](https://github.com/FlareZ123/obfs/actions/runs/44045020398).

No passing or failing runner outcome is yet claimed at this document version. These pinned runs must be checked before upgrading the evidence status.

## Candidate and invariant

At execution entry, recognized batch inputs are cloned once **before** the outer argument-aware authorization callback. Every recognized inner check receives another copy of its call argument list. The private registered method executes from the initial snapshot. A direct, non-batch method continues seeing the original argument list. The snapshot is taken after bounded JSON parsing, so the graph consists only of JSON-parsed values and has no cycles, accessors or callables.

The intended invariant is: the method/argument pairs that a recognized batch finally executes must be the same submitted method/argument values that each relevant preflight call was presented with. Changing a policy-visible input must never turn an earlier authorized read into a different registered operation. Refusals, method registration checks, transport validation, and ordered effects retain their pre-existing behavior.

Node 22 provides the WHATWG `structuredClone` global. In a local Node 22.16.0 micro-check, cloning retained `-0` and a parsed-overflow-like `Infinity` number, preserved object independence, and did not follow subsequent mutations of the original array. This check is a primitive sanity test rather than full HTTP parity or a performance guarantee.

## Compatibility, cost, and limits

- The fix intentionally stops relying on callback mutation as a way to rewrite a recognized batch. An application that used authorization callbacks for argument canonicalization must canonicalize before constructing the request, or register an explicit trusted method with validated inputs.
- Existing `preflightScoBatchState` remains a separate pure synchronous state-transition model. The snapshot cannot solve account revocation races, unsound policy models, concurrent writes outside an isolation scope, or a deliberately privileged integrator changing the program itself.
- Cloning the bounded body and the per-item argument lists allocates data proportional to the RPC JSON graph. The handler default is `maxRpcBytes=65536`. The existing paired `sims/sco-batch-state-cost.js` covers local HTTP overhead for 32-call batches, but a new pinned green sample is required to attribute deployment cost. No universal **2.5×** bound follows.
- The SCO trust model assumes attacker control of clients and requests, while server code and policy remain trusted. This demonstrates a server integration safety improvement only. It does not establish client resistance to instrumentation, source recovery, permitted online relays, or authorized cross-account use.

## Reproduction

On a checkout of the test-only commit, run the existing manually dispatched `manual-sco-authorization.yml` workflow or the single Node 22 test file, then repeat on the patched commit. The workflow includes full SCO integration checks, strict JSDoc, and sampled authenticated batch cost. Record exact source SHA, per-OS test counts and any failures before declaring red/green.
