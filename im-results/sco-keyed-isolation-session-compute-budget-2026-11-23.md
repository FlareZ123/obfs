# Repeated-use SCO keyed-isolation CPU budget with same-code placebo

**Agent 26; 23 November 2026. Intermediate operational performance research.**
The experiment measures the server-side isolation callback itself under a
fixed, checksum-verified HMAC workload. It is neither a general SCO execution
benchmark nor evidence of new static/dynamic obfuscation resistance. The
primary three-mode strong-protection decision remains **RELEASE-BLOCKED**.

## Question and compared implementations

'createScoKeyedIsolation' admits a verified principal into a keyed FIFO and,
with two optional positive capacities, counts both running and waiting RPC
callbacks. That concurrency mechanism improves operational admission, but
its repeated per-call work also consumes the primary objective's 2.5×
**compute** budget. This experiment isolates that cost from HTTP transport.

Each session invokes the same Node 22 SHA-256 HMAC body with four variants:
'direct' calls the same async HMAC callback without isolation;
'direct-control' calls exactly the same direct callback as an independent
placebo; 'uncapped' executes it through the production keyed isolation helper
with no optional quota; 'capped' executes it through the same helper with
'maxPendingPerPrincipal:8,maxPendingTotal:32'. The verified-principal resolver
is synchronous and returns the same fixed trusted principal. Each test phase
uses a fresh workload buffer, but its call-by-call input bytes are identical
across variants. The callback updates a deterministic checksum, and every
four-way trial checks exact equality.

The two fixed workloads use the actual native crypto implementation rather
than a no-op microbenchmark:

- **Tiny repeated work:** 8,192 calls with one HMAC over 64 bytes each, then
  a separate 65,536-call version of the same operation to reduce Windows
  CPU timer granularity.
- **Substantial repeated work:** 128 calls, each performing 128 HMAC rounds
  on a 16,384-byte input.

Every mode is warmed for 16 calls. Isolation helper initialization occurs
before the measured session, consistent with the allowed server-side
initialization exception. Only initialization is excluded. CPU time uses
'process.cpuUsage' (combined process user and system, in milliseconds);
wall time uses 'performance.now'. Every measured operation and async
continuation is charged. Twelve paired trials rotate the order of all four
arms so each arm occupies each order rank three times. Strict ratios above
2.5 are retained, while a passing Node test verifies workload identity
and logging, **not** a budget promise.

## Immutable executable evidence

Source:
[research branch](https://github.com/FlareZ123/obfs/tree/agent26/keyed-isolation-session-profile-20261123),
'test/sco-keyed-isolation-session-profile.test.js', and explicit
'jsconfig.external.json' JSDoc test enrollment.

- **Short 8,192-call source:** '69ba6f42a8af6a7869f4dc97565c324a042d2f67'.
  Two independent GitHub Actions invocations
  [45147692738](https://github.com/FlareZ123/obfs/actions/runs/45147692738) and
  [45147911826](https://github.com/FlareZ123/obfs/actions/runs/45147911826)
  passed focused Ubuntu/Windows Node 22 and all strict JSDoc gates.
  Both runs' original JSON observations are preserved at
  [sco-keyed-isolation-short-profile-20261123.json](sco-keyed-isolation-short-profile-20261123.json).
- **Long 65,536-call source:** '06eb55e9f864d72f5db9f44762e15ceae908918e'.
  Independent [45148181377](https://github.com/FlareZ123/obfs/actions/runs/45148181377)
  and [45148479589](https://github.com/FlareZ123/obfs/actions/runs/45148479589)
  also passed both focused operating-system jobs and strict JSDoc.
  Their complete raw trial observations are archived at
  [sco-keyed-isolation-long-profile-20261123.json](sco-keyed-isolation-long-profile-20261123.json).

All four runs used Node v22.23.4. The full Node/Chromium repository matrix
was intentionally skipped by the focused workflow. The first preparatory
version [45147203801](https://github.com/FlareZ123/obfs/actions/runs/45147203801)
was red on Windows because a short 16-call warmup registered zero CPU ticks.
The source then excluded this deliberately short warmup from the positive
CPU-time assertion and lengthened the tiny measured workload. This is a
test-instrumentation correction, not a product behavior change.

## Direct-source-paired observed results

Each row has twelve pairs and reports *median* CPU ratios plus
individual strict >2.5 CPU and wall breach counts for capped/direct.
The placebo is a byte-identical direct method call on the same input.

| Run | OS | Workload | Capped/direct CPU median | Direct placebo CPU median | Capped strict CPU >2.5 | Placebo strict CPU >2.5 | Capped strict wall >2.5 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 45147692738 | Windows | 8,192 tiny calls | 2.5354× | 1.0333× | **6/12** | **1/12** | 0/12 |
| 45147692738 | Ubuntu | 8,192 tiny calls | 1.7987× | 0.9988× | 0/12 | 0/12 | 0/12 |
| 45147911826 | Windows | 8,192 tiny calls | 1.8404× | 1.0000× | **5/12** | 0/12 | 0/12 |
| 45147911826 | Ubuntu | 8,192 tiny calls | 1.7423× | 0.9196× | 0/12 | 0/12 | 0/12 |
| 45148181377 | Windows | 65,536 tiny calls | 1.9968× | 0.9971× | **1/12** | 0/12 | **1/12** |
| 45148181377 | Ubuntu | 65,536 tiny calls | 1.7467× | 0.9794× | 0/12 | 0/12 | 0/12 |
| 45148479589 | Windows | 65,536 tiny calls | 2.0743× | 0.9466× | 0/12 | 0/12 | 0/12 |
| 45148479589 | Ubuntu | 65,536 tiny calls | 1.7008× | 0.9918× | 0/12 | 0/12 | 0/12 |

At the short source, the native direct Windows median CPU time for 8,192
calls was only about 15.5 milliseconds in the first run. Some individual
CPU measurements were exact coarse multiples near 15–16 milliseconds.
The 3.133× **identical direct-placebo** outlier in the first Windows run
demonstrates that this measurement can report a strict >2.5 value without
different application code. Ratios on such short CPU intervals are
not reliable causal estimates of isolation overhead.

The eightfold-longer input improved the baseline measurement duration.
Windows still observed **one** capped/direct strict CPU ratio of 2.506×
and one strict wall ratio of 2.582× in the first independent long run
(on different trial indices); the second same-source Windows run found
none. The Ubuntu long sessions found none. The strict observed breaches
must be preserved; sample size and process/runner scheduling are
insufficient to attribute their causes or claim a universal budget.

On the **substantial** HMAC workload, capped/direct CPU median ratios for
the four short-source OS jobs ranged from 0.9968× to 1.0059×,
and for the four long-source OS jobs ranged from 0.9054× to 1.0968×.
All eight jobs reported **zero individual strict >2.5 CPU and wall ratios**
on this larger per-call computation. This is conditional, finite
performance evidence. It gives no guarantee for different methods,
payloads, memory behavior or runtime populations.

## Interpretation and boundary

The difference between capped and uncapped keyed isolation in these
sequential samples was much smaller than the difference between either
isolation path and direct callback execution for tiny work. The quota
limits were configured but **never saturated**: there was one
sequential authenticated principal and no concurrent queue. Therefore
this experiment does not revalidate rejection/fairness semantics under
contention; the existing keyed-capacity test suite covers that separately.

The paired timing results suggest that the fixed per-call authentication
and FIFO machinery can be important for tiny protected functions, while
repeated substantial computation amortizes it. Batching can be investigated
as an admission option only when it preserves application semantics and
authorization boundaries. Independent profiling for each selected real
SCO workload remains mandatory under a literal strict 2.5× cap.

The profile does **not** measure HTTP request parsing, HTTPS/TLS,
serialization, transport latency, browser fetches, multi-process quota
coordination, SCO obfuscator compilation, dynamic attack cost, static
reconstruction, or any Coo/Sno runtime path. It does not compare a
generated obfuscated service with a same-trust ordinary private API,
so it cannot support a release or security advantage decision. No
production 'src/' or 'bin/' code was changed, and the research branch is
unmerged. A future candidate needs matched real-HTTP and full-session
CPU measurements with an independently reviewed original baseline.

**Disposition: retain as a bounded performance-budget caution and a
reproducible negative/tail sample, not as an obfuscator-security finding.**
