# Matched SCO-generated versus conventional authenticated server RPC

**Agent 15, 17 November 2026. Classification:** scoped architecture
ablation and compute evidence, not an obfuscation security theorem.

The experiment compares the compiler-generated SCO ESM client with a
manually written conventional ESM RPC client under **the same trusted
private HMAC implementation, Node server, HTTP handler and authenticated
per-account operation policy**. It isolates the architectural benefit
of server-private computation from public-client source transformation.
The precommitted hypothesis and decision criteria are recorded separately
in [workplace/sco-plain-server-control-2026-11-17.md](../workplace/sco-plain-server-control-2026-11-17.md).

## Frozen experimental design

`sims/sco-plain-server-control.js` constructs a new 256-bit private
HMAC key at runtime, withholds the key, the `createHmac` implementation,
and the canary from all public files, and runs the same export
`derive(input)` on the Node 22 server for both clients. Its original
per-call work is an HMAC over a principal, a 64-character challenge and
an 8 MiB fixed buffer. The output is a hexadecimal digest. The two
public modules are actually served from `createScoHandler`; a client
may inspect both complete served source files and all HTTP responses.

- **SCO:** `partitionScoAsyncModule` generates the public `derive`
  stub with a hashed method ID and private source retained on the server.
- **Conventional:** hand-written ESM stub uses the same fetch method,
  credentials, JSON payload, same-origin endpoint, error contract, and
  server operation, with the plain method ID `plain-digest`.
- **Policy:** both require an authenticated account A/B token and a
  strict 64-character lowercase hex input. An unauthenticated call is
  403. A response for B is checked against its distinct authenticated
  digest; possessing only A's credential never produces B's output.
- **Attacker:** reads the actual served stubs, extracts the SCO hashed
  method ID from public source, and performs its own permitted A-token
  RPC calls on 32 held-out challenges. No private key, private module
  namespace, compiler configuration, or B token is given to the
  attacker. The verifier compares results only after requests.

The direct native comparator invokes the **same original HMAC export**
under the same principal isolation and includes all 16 original
HMAC computations. Both HTTP stubs each issue 16 real loopback
requests per complete session. Eight rotated mode-order trials per
OS compare process CPU and wall time against that native floor.
Public source size, JSON request bytes, private execution counts,
and whole-session digests are recorded.

## Exact cross-platform evidence

Initial [run 44156192408](https://github.com/FlareZ123/obfs/actions/runs/44156192408)
at SHA `fb534950263ae2361be6dac290ceb452ebbe68e2`
completed the runtime/attacker experiment on Ubuntu, but failed
`typecheck:external` because the new experiment harness lacked two
JSDoc annotations. The source was corrected without changing the
experiment's behavior; this initial workflow is **not** a full green
qualification.

**Validated run:** [44156361702](https://github.com/FlareZ123/obfs/actions/runs/44156361702),
exact source SHA `3cb778b2d99d65ddc43c87f62e3f36710bfd8d8b`.
Ubuntu Node22 and Windows Node22 both completed the runtime experiment
and both strict JSDoc checkers successfully.

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Own-account generated facade online relay | 32/32 | 32/32 |
| Own-account conventional facade online relay | 32/32 | 32/32 |
| A-only requests matching B-account digest | 0/32 | 0/32 |
| Unauthenticated RPC | 403 | 403 |
| Key/canary/private HMAC source in public files | Absent | Absent |
| Generated process-CPU pairs exceeding 2.5× native | 0/8 | 0/8 |
| Conventional process-CPU pairs exceeding 2.5× native | 0/8 | 0/8 |
| Generated wall-time pairs exceeding 2.5× native | 0/8 | 0/8 |
| Conventional wall-time pairs exceeding 2.5× native | 0/8 | 0/8 |
| Largest observed generated/native CPU ratio | 1.46111× | 1.97468× |
| Largest observed conventional/native CPU ratio | 1.32514× | 2.00000× |
| Largest observed generated/native wall ratio | 1.21113× | 1.24302× |
| Largest observed conventional/native wall ratio | 1.20720× | 1.25100× |
| Median of per-trial generated/conventional CPU ratios | 0.99432× | 1.00917× |
| Median of per-trial generated/conventional wall ratios | 1.01369× | 1.00820× |

Each OS performed 448 protected remote calls across held-out attacks,
warmups and measured sessions. All 16 outputs per measured session
matched exactly. Windows reported **zero unresolved process-CPU pairs**
and Ubuntu likewise; a positive process CPU delta was available for
every included sample.

Both platforms reproduced identical public SHA-256 fingerprints:
generated `4a17a2f6239a490f0017427b73a79e91dc9245bab49e11ee2ec2658165dd3dee`,
conventional `f58e51a6967f83ac8dc0e4a4c552514170185423c1a6be91163f64f4b7ff7064`.
Generated public code was 502 bytes, conventional 445 bytes.
Total JSON body bytes for 16 requests were 1,824 generated and
1,616 conventional. The generated method identifier's additional
spelling accounts for that 208-byte transport difference in this
selected protocol; no claim about general gzip/network cost follows.

The experiment workflow was temporarily limited to this script and
the two existing strict type checks on the isolated research branch.
After the green pin, its contents were restored to the upstream
manual SCO workflow in commit
`a6a7276c43a3e32bc1883c6a195901fa10878352`; the permanent diff
contains no new workflow.

## Independent dimension verdicts

**Static extraction:** Both public modules lack the private key, HMAC
implementation and source canary. The private file route returned 404.
A stronger static search or a compromised server is outside this
experiment. Both implementations have the same trust boundary.

**Dynamic relay:** Source-only public method discovery plus A's
legitimate authorization yields a complete online A-account clone
of the tested HMAC API for both stubs, 32/32. The generated hashed
method name is published and introduces no authentication gate.
B's distinct account-bound outputs are inaccessible to A-token
calls in the 32 tested challenges for both variants.

**Unauthorized modification / environment:** Both stubs can be edited
by the client or bypassed by a direct HTTP POST. Authorization is
the shared server policy, not client-side integrity. The test
does not establish browser URL locks, credential theft resilience,
server compromise resistance or cross-origin cookie controls.

**Compute/compatibility:** On this deliberately CPU-heavy 8 MiB-HMAC
fixture, no sampled whole-session ratio exceeded 2.5× native on
either OS; the generated and manual wrappers have close measured
central ratios. The paired results remain descriptive: no statistical
worst-case bound or guarantee for cheap methods, remote network RTT,
cold startup, errors or full JavaScript semantics. A 16-request
sequential API may fail the same budget on normal lightweight work.

## Decision

**No incremental cryptographic confidentiality or authorized-online-relay
resistance was demonstrated by the generated SCO facade over the
conventional authenticated server facade under matched trust and
policy.** The generated stub may aid partition tooling and
integration, while protecting source chiefly because **the code stays
on the trusted server**. We did not test the per-object 256-bit
capability store of experimental PR #65, which offers additional
object-lifetime and revocation features under its separate API contract.
This negative ablation cannot reject those features.

A successful server-private candidate should therefore compare
its strongest claim against an appropriate conventional trusted-server
control, alongside its existing native/minified-local control, with
the same attacker query budget. More complex public code or opaque
method names should not be promoted to security without a distinct
reproducible attacker-cost advantage.

## Actual browser parity follow-up

The same precommitted API control was subsequently exercised in **real
headless Chromium on Ubuntu**, using browser-native same-origin ESM imports
of both public stubs. The server serves one top-level HTML document with
a random 256-bit account-A session token in an `HttpOnly; SameSite=Strict`
cookie; the generated and conventional `fetch` helpers use
`credentials:"same-origin"`. Both browser requests pass the identical
`authorizeRpc` and `authorizeOperation` policy as the Node runs,
with the cookie mapped to the same account-A principal as the test's
header-authenticated Node session. The page invokes each `derive`
on one held-out challenge, and the parent verifier checks the rendered
DOM digests against direct native account-A output and checks that
exactly two private RPCs ran.

**Exact browser+Node green:**
[workflow 44157437373](https://github.com/FlareZ123/obfs/actions/runs/44157437373),
executable source SHA `c4a373b90ee680dcd07265329e40e2ba170125bf`.
Ubuntu real Chromium reported `chromiumParity:"passed"` and
`chromiumPrivateCalls:2`; the generated and conventional digests
both matched the native server. Windows deliberately had no Chromium
step and reported `chromiumParity:"not-run"`. Both OSes independently
passed their 8×16 native/HTTP paired sessions with no process-CPU
or wall ratio above 2.5×, plus both strict JSDoc checkers. This is
**functional browser parity only**; Chrome's `--virtual-time-budget`
was used to let a module script finish and **not** as a CPU clock.
The native-versus-HTTP process CPU measurements remain Node-only.

The browser addition was isolated from measured Node trials by running
the Chromium page **after** the rotated benchmark rounds. Ubuntu's
private call total became 450, versus 448 on Windows, because of those
two explicit browser RPCs. Per-trial ratios vary between runs:
in the browser follow-up, median generated/manual process CPU ratios
were 1.03025× Ubuntu and 0.80769× Windows, and median wall ratios
1.02332× and 1.02491× respectively. These paired observations are
not a statistical claim that either wrapper is intrinsically faster.

The temporary manual workflow was again restored to the upstream
file contents after this exact-source run at commit `49bce1659fe189fdced4bd88ba10dc361a315a85`.
All original limits on authorized in-browser instrumentation, cookie
visibility to the controlling attacker, cheap operations, WAN latency
and universal runtime budgets remain in force.
