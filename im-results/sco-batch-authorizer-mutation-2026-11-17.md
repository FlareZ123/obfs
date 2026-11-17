# SCO recognized-batch policy mutation isolation, 2026-11-17

**Status:** The two original real-HTTP mutation regressions are now confirmed red on Ubuntu and Windows at the exact pre-fix SHA. The current native-JSON-parser candidate has a queued green gate and remains provisional. This is an intermediate trusted-server correctness investigation, not an established obfuscation or security-resistance result.

## Problem and execution boundary

The public SCO HTTP handler parses a bounded JSON body, chooses a registered private method, and invokes an application-supplied `authorizeOperation` callback. Registered `createScoBatchMethod` calls receive an outer policy check and one authorization check for each recognized inner operation before any private operation runs. Before the candidate, all these callbacks and the actual registered batch saw references into the **same decoded mutable array**.

A server integrator that mutates already checked batch records during policy evaluation can change what the private method will later execute. This can accidentally execute a different registered operation from the one preflighted. A client cannot by itself cause a trusted application's policy callbacks to make these mutations; this is a robustness issue for integrators with mutation-capable policy or middleware.

### Concrete counterexample

Submit `batch([{method:'read',args:[1]},{method:'read',args:[2]}])`. A permissive outer callback retains the `calls` array. The first inner `read` passes its check. During the second inner check, application code overwrites the first call with `{method:'forbidden',args:[99]}`, then approves the second `read`. The prior handler passes the same array to `createScoBatchMethod`, so it can execute `forbidden(99)` despite only authorizing the first `read(1)`. A parallel numerical-control test overwrites the first `charge` argument from 1 to 99 during the last approval.

The tests record both HTTP results and private method side effects:
- `test/sco-batch-policy-mutation.test.js`: two actual localhost HTTP cases, including a registered `forbidden` method never approved by `authorizeOperation`.
- Baseline test-only SHA `140d6fb1392726e4006cc88735b0c7b9113cfb4d`, manual authorization workflow [run 44044692709](https://github.com/FlareZ123/obfs/actions/runs/44044692709).
- Initial source patch commit `8b4f9a3c361553e663c1fc74ff7420c33f9bfad9`, superseded second manual authorization workflow [run 44045020398](https://github.com/FlareZ123/obfs/actions/runs/44045020398).
- Extra deep JSON and numeric/property-key controls added at `5036d8d68aaaf5118aeff46dc64809e61771224b`, with an initial iterative copy at `382cc3e8fe21f4e9503be7d0e6a97f81e059c794`, subsequently replaced by independent native JSON parses at `d27eacdd0e78d561bffc9d2cf064ed4495a624f5`.

### Verified pre-fix red execution

[Manual authorization workflow 44044692709](https://github.com/FlareZ123/obfs/actions/runs/44044692709) completed on Ubuntu and Windows Node 22 for exact SHA `140d6fb1392726e4006cc88735b0c7b9113cfb4d`. Both jobs failed the **same two intended new tests** within the 168-test SCO HTTP/partition suite. The first test expected approved `read(1)` and instead received the value `99` from an unapproved registered `forbidden(99)` call. The second expected `charge(1)` to return `10` and instead received `990` after the callback mutated the previously approved first argument to `99`. Ubuntu reported 166 passes / 2 failures. Windows reported 165 passes / 2 failures / 1 skipped. The workflow stopped at the targeted tests as expected; its later performance and typecheck stages did not run. This pins the *pre-fix* behavior, not a green post-fix result.

A newer test includes an additional mutation of the current inner callback argument list, a 5,000-depth valid JSON case, negative-zero and exponent-overflow checks, and own `__proto__` data-property preservation. The current candidate is at `d27eacdd0e78d561bffc9d2cf064ed4495a624f5` with the latest test-only addition at `837f5a277477887e83541be4a1fb419c9961a67d`. Its [manual green attempt 44048517033](https://github.com/FlareZ123/obfs/actions/runs/44048517033) is pending. Any newer conclusion must quote its exact checked SHA and job statuses.

## Candidate and invariant

At execution entry, recognized batch inputs are copied once **before** the outer argument-aware authorization callback. Every recognized inner check receives another copy of its call argument list. The initial `structuredClone` candidate failed a valid deep JSON input: Node 22.16.0 parsed 5,000 nested arrays (~10,001 bytes), while `structuredClone` threw a `RangeError`. The interim `cloneJsonArgs` performed an iterative own-data-property traversal, avoiding the depth-bound recursive copy. A subsequent isolated Node microcheck showed that native `JSON.parse` of the validated original text was substantially faster than that manual traversal for the tested deeply nested inputs. The current candidate retains the exact original validated JSON text and parses it two more times **before** invoking any argument-aware policy callback. One graph belongs to the outer callback, one graph belongs to inner per-item checks, and the third executes. Each parse preserves the exact same JSON semantics and nesting limit as the initial admission parse. The private registered method executes from the initial snapshot. A direct, non-batch method continues seeing the original argument list. The snapshot is taken after bounded JSON parsing, so the graph consists only of JSON-parsed values and has no cycles, accessors or callables.

The intended invariant is: the method/argument pairs that a recognized batch finally executes must be the same submitted method/argument values that each relevant preflight call was presented with. Changing a policy-visible input must never turn an earlier authorized read into a different registered operation. Refusals, method registration checks, transport validation, and ordered effects retain their pre-existing behavior.

A local Node 22.16.0 direct check of the superseded iterative algorithm preserved 5,000 levels of array nesting, `-0`, overflow to `Infinity` and an own `__proto__` data property. Independent re-parsing uses the same native JSON parser that first admitted each HTTP body, making that ad hoc clone consistency check unnecessary. The actual real-HTTP parity and strict JSDoc gate remain pending.

## Compatibility, cost, and limits

- The fix intentionally stops relying on callback mutation as a way to rewrite a recognized batch. An application that used authorization callbacks for argument canonicalization must canonicalize before constructing the request, or register an explicit trusted method with validated inputs.
- Existing `preflightScoBatchState` remains a separate pure synchronous state-transition model. The snapshot cannot solve account revocation races, unsound policy models, concurrent writes outside an isolation scope, or a deliberately privileged integrator changing the program itself.
- Creating two additional native parses of the bounded request allocates data proportional to the RPC JSON graph. The handler default is `maxRpcBytes=65536`. The new deep input uses about 10 KiB, so it is realistic under that cap. The existing paired `sims/sco-batch-state-cost.js` covers local HTTP overhead for 32-call batches, but a new pinned green sample is required to attribute deployment cost. No universal **2.5×** bound follows.
- The SCO trust model assumes attacker control of clients and requests, while server code and policy remain trusted. This demonstrates a server integration safety improvement only. It does not establish client resistance to instrumentation, source recovery, permitted online relays, or authorized cross-account use.

## Reproduction

On a checkout of the test-only commit, run the existing manually dispatched `manual-sco-authorization.yml` workflow or the single Node 22 test file, then repeat on the patched commit. The workflow includes full SCO integration checks, strict JSDoc, and sampled authenticated batch cost. Record exact source SHA, per-OS test counts and any failures before declaring red/green.

## Isolated JSON parsing cost control (provisional, local Node 22.16.0)

The independent-views candidate uses three parses of one validated bounded
HTTP request, compared with one parse in the original. A reproducible
parser-only paired workload is committed as
[`sims/sco-batch-json-parse-cost.js`](../sims/sco-batch-json-parse-cost.js)
at `1e808f653cb20ee8952b095cf5972a99abadcf54`. An equivalent Node 22.16.0
local in-process run used 13 alternating-order sample pairs at 300 parsed
requests per trial, with four untimed warmup pairs for each selected payload.
It checked the consumed call count and retained exact timing rows in the
execution output; this report presents rounded summaries.

| Calls per request | JSON bytes | 1-parse median / 300 requests (ms) | 3-parse median (ms) | Median paired slowdown | 95% one-sided upper rank-10 ratio |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 139 | 0.267 | 0.873 | 3.156 | 3.430 |
| 16 | 1,795 | 2.382 | 7.474 | 3.172 | 3.331 |
| 64 | 7,123 | 9.064 | 27.142 | 3.000 | 3.124 |

The upper rank-10 bound assumes independent identically distributed
continuous paired ratios, an assumption the hot single-process run does not
establish because of shared CPU drift and garbage collection. All three
selected parser-only medians exceed 2.5x, as expected from additional parsing.
**This is not a full SCO slowdown measurement**: it excludes HTTP transport,
authorization policy work, protected operations and response serialization.
The absolute added parse cost is small in these selected 300-request batches,
but high-frequency trivial operations already violate the project's full
2.5x budget in prior independent SCO release tests. No unconditional latency
or cost claim should accompany this correctness fix.

The trusted server and authenticated RPC interfaces remain a distinct
threat model from arbitrary client-side static extraction; these samples do
not evaluate obfuscation secrecy or instrumentation resistance.
