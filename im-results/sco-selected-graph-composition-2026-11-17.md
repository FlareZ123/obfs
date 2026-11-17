# Composed selective SCO graph: source boundary, relay and granularity

**Status:** Intermediate engineering evidence, 2026-11-17. This is not a
claim of novel cryptographic protection or general JavaScript equivalence.
The exact paired-run source is
[`ce8cf838341b1fc50112f7a9d817e6d94221c334`](https://github.com/FlareZ123/obfs/commit/ce8cf838341b1fc50112f7a9d817e6d94221c334),
with the [Linux/Windows workflow run](https://github.com/FlareZ123/obfs/actions/runs/44071407174)
and preserved [raw observations](sco-selected-graph-observations-2026-11-17.json).

## Candidate and scope

`partitionScoSelectedGraph` composes two or more *independent* mixed public
and private ESM modules. It reuses the selective partitioner's native public
ESM transformations, private async export RPC proxies and server-only static
imports. Its compiler-owned handler publishes the generated facade bytes only.
It refuses conflicting private source commitments, casefolding and exact
path collisions, public facade paths that overlap private dependencies,
missing audited private source bytes, RPC method collisions and
post-compilation manifest changes. Each compiled facade carries the union of
private path/digest metadata for route admission. The server loads the original
namespaces, and the integrator still supplies the actual authorization policy.

The paired positive HTTP test has two selected modules importing one
identical server-private ESM source. Native ESM results match their generated
counterparts over empty, ASCII, Unicode and astral inputs. Unauthenticated
module reads and RPC requests return HTTP 403 and an attempted private source
GET returns HTTP 404. A separate regression checks both modules' bounded
batch identities. This is an implementation-level publication test, with
unproved full-program semantics beyond the admitted source subset.

## Pinned behavior and environment

The exact pinned run used Node **v22.23.4** on both hosted Linux and Windows,
with **206/206** Node tests passing on Linux and **205 passing, one skipped,
zero failing** on Windows. Real Chromium on Linux imported both generated
ESM modules and matched two authenticated server RPC results. The
independent public-only relay and native-versus-RPC simulations completed
successfully on both systems.

The overall workflow status was **failure** because a concurrent change to
`src/sco-selective-partition.js` introduced a JSDoc return union mismatch
in the `error stack` diagnostic. That mismatch was corrected in later source.
The newer `src/sco-selected-graph.js` imported mutable-module state
admission and its specific state witnesses **were not part of this pinned
run**. They require a separate pinned validation.

## Native versus warm authenticated two-module sessions

Each session invokes a selected private function once in each of two
original modules. The workload performs the same deterministic
`Math.imul` loop with 1, 100,000, 1 million or 8 million iterations.
Each level has nine trials alternating native-first and RPC-first. The
sampled duration includes the browser-style same-origin JSON RPC facade
executed on Node loopback, with a fixture session header, and excludes
cold startup and import cost. There is no TLS or physical WAN RTT.

| Iterations per private module | Linux native median | Linux RPC median | Linux ratio | Windows native median | Windows RPC median | Windows ratio |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.005288 ms | 2.305719 ms | 436.029× | 0.006200 ms | 2.212600 ms | 356.871× |
| 100,000 | 0.210168 ms | 1.565103 ms | 7.447× | 0.272600 ms | 2.113300 ms | 7.752× |
| 1,000,000 | 2.091863 ms | 3.367393 ms | 1.610× | 2.776900 ms | 4.624100 ms | 1.665× |
| 8,000,000 | 16.607733 ms | 18.075308 ms | 1.088× | 21.652300 ms | 24.217200 ms | 1.118× |

These specific two-module warm loops meet the project's 2.5× limit at
1 million and 8 million iterations and substantially exceed it at the
lighter levels. The smallest native denominators are just microseconds,
so their exact ratios are noisy; the order-of-magnitude transport penalty
and its amortization with larger work are the relevant observations.
Neither platform demonstrates an all-code 2.5× bound or a production RTT
budget. Both public output files lacked the `PRIVATE_KEY_` canary, and
both platforms emitted identical expected original and published source
SHA-256 digests, which are included in the raw JSON.

## Independent authorized attacker

The separately implemented
[`sco-selected-graph-attacker.js`](../sims/sco-selected-graph-attacker.js)
imports neither private original code nor the compiler. It is given the
two advertised facade URLs, the server's origin and a legitimate session
credential, then derives each private method identifier and common endpoint
from the published JavaScript. Its own HTTP `/clone` route forwards only
those authenticated method calls. The
[reproducible defender harness](../sims/sco-selected-graph-relay.js)
generates independent random HMAC secrets in the defender process.

The attacker reproduced **64/64 independently sampled held-out values** on
both Linux and Windows. It did not receive private HMAC keys or original
source, and its acquired facades contained no private key canary. A direct
unauthenticated RPC returned **403**, while a private source path returned
**404**. The attacker succeeded by relaying its legitimate target
credential. Consequently, withheld private bytes and successful access
control do not prevent a same-account online functional clone. No offline
key extraction or offline HMAC model is demonstrated.

## Additional semantic isolation bound

A later, conservatively admitted source subset refuses mutable module-level
state in audited imported ESM child modules, including top-level
`let`/`var`, object-valued `const` initializers and first-class
function-object mutations. This addresses a concrete native semantic
difference: two independent module instances each return 1 on their first
call to a module-scoped counter, while one server module shared between
sessions returns 1 then 2. The runnable witness is
[`test/sco-selected-graph-state.test.js`](../test/sco-selected-graph-state.test.js).
This syntactic guard remains a conservative admission policy, not a proof
against all inherited, transitive, native API or principal-specific effects.
The newer guard awaits its own pinned validation result.

## Interpretation and next validation

The new composite graph is a useful source-publication and multi-module
RPC integration facility under the SCO trusted-server model. It adds no
general anti-instrumentation guarantee in browser-controlled environments.
The same-account relay above remains an explicit failed protection goal.
No SNO or COO adversary conclusion follows. Publication correctness,
cross-client state isolation and warm runtime remain separate questions;
each requires a specific test and threat model.

Next, validate the updated mutable-module-state guard on both operating
systems, typecheck the final file set, confirm the Chromium test remains
green, and rerun the independent relay and granularity profile at a
single immutable head. Compare any proposed security advantage against a
conventional authenticated server API and a native/minified control before
promoting claims to `results/`.
