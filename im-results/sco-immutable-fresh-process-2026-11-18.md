# Read-only SCO batch sharing with native and equal-trust fresh-client controls

**Agent 1, 18 November 2026. Intermediate, reproducible engineering cost evidence. Overall strong-protection release remains BLOCKED.**

## Exact source and experiment

The opt-in `immutableBatchArgs:true` in SCO parses the JSON request once and recursively freezes the parsed arguments before outer policy, inner policy and registered read-only batch execution. The current default `false` instead separately parses policy views. This setting changes the private application's mutability and object-identity contract, so the experiment uses the bounded, pure, registered original application that reads only numeric primitive arguments.

Both manually dispatched branches executed **the same source** `9abc7ec4843d8a3f1bef33744d5e087ce4079b0b`, with no per-commit CI: [opt-in run 44357887639](https://github.com/FlareZ123/obfs/actions/runs/44357887639) and [ordinary/default run 44357896562](https://github.com/FlareZ123/obfs/actions/runs/44357896562). Both runs passed Ubuntu and Windows Node 22 and strict JSDoc. The manual-only workflow `.github/workflows/manual-sco-batch-fresh-process.yml` now accepts `immutable_batch` (boolean; default false). This argument is explicitly conveyed as `OBFS_SCO_BATCH_IMMUTABLE_ARGS=1` only for the opt-in run. `sims/sco-batch-fresh-process-cpu.js` returns `immutableBatchArgs` in its JSON receipt. The true/false executions ran as **separate CI dispatches and runner processes**, so they are scoped standalone comparisons to the shared native and ordinary control and cannot support a highly precise between-run speedup estimate.

For each original/private work size (1 or 1,000 iterations/call), each run generated 12,288 requests' worth of deterministic HMAC-like application values. The generated and ordinary equal-trust clients both fetched real authenticated ESM from a trusted loopback HTTP server and used 1,024-call batches; the native client called the original ESM in a separate fresh Node child. The server's existing secret, source, authorization and batch preflight were shared by the two HTTP variants. Output SHA-256 parity was asserted for all three arms on every pair, alongside authenticated source admission and unauthorized/invalid-operation denials. Nine alternating-order three-arm trials ran on each platform. CPU is the sum of process-wide user+system CPU from the **fresh client process** and the already-running trusted HTTP server for the measured session. Trusted server initialization is excluded; fresh client startup and module compilation are included. These measurements do not include a real browser, TLS, WAN, external database or cross-account load.

## Source-pinned results

All table values below are rounded median CPU milliseconds, median-of-arm generated/native and generated/ordinary CPU ratios, plus the actual count of strict **generated/native pairwise CPU breaches above 2.5×**. Each row has nine real matched within-run trials. `C` means the equally trusted conventional minified HTTP client; `G` means the generated SCO facade.

| Run arm / platform | Work per call | Native CPU ms | G CPU ms | C CPU ms | G/native median | G/C median | Strict G/native CPU >2.5× |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Immutable / Ubuntu | 1 | 64.194 | 191.163 | 185.387 | 2.978× | 1.031× | **8/9** |
| Immutable / Windows | 1 | 108 | 281 | 279 | 2.602× | 1.007× | **6/9** |
| Default / Ubuntu | 1 | 109.409 | 344.124 | 339.794 | 3.145× | 1.013× | **8/9** |
| Default / Windows | 1 | 124 | 298 | 312 | 2.403× | 0.955× | **5/9** |
| Immutable / Ubuntu | 1,000 | 149.680 | 270.376 | 272.196 | 1.806× | 0.993× | 0/9 |
| Immutable / Windows | 1,000 | 217 | 375 | 405 | 1.728× | 0.926× | 0/9 |
| Default / Ubuntu | 1,000 | 257.890 | 480.376 | 489.486 | 1.863× | 0.981× | 0/9 |
| Default / Windows | 1,000 | 234 | 436 | 406 | 1.863× | 1.074× | 0/9 |

**Strict paired wall-time G/native breaches**, in the same row order, were 8/9, 1/9, 7/9, 2/9, 0/9, 0/9, 0/9 and 0/9. **G/C strict CPU and wall breaches** were zero in all eight nine-pair rows. The raw pair CPU and wall arrays and bounded CPU/wall estimates are retained in complete `SCO_BATCH_FRESH_PROCESS` JSON in each CI job log and per-platform workflow artifacts. The ratio of two separate arm medians can disagree with the strict paired breach count due to pair ordering, fluctuations and discrete Windows CPU samples. For this objective, **any strict CPU pair above 2.5× vetoes the tested workload regardless of medians**.

## Interpretation and decision

The selected short-work workload still fails the 2.5× total process-CPU limit after applying the immutable-batch option. Opt-in short-work strict CPU breaches were 8/9 Ubuntu and 6/9 Windows. The longer 1,000-iteration workload had zero strict CPU breaches in the finite samples, while its warm and cold network-client and selected-hot-path budgets remain workload dependent and unproved. Equal-trust generated/conventional medians stayed in the vicinity of 1×, consistent with much of the short-work cost being the HTTP/service boundary shared by both implementations. As a design optimization, freezing/sharing parses has separate grounded local HTTP benefits for large JSON records in [the shape profile](sco-immutable-batch-current-baseline-2026-11-18.md).

The two variants have **no demonstrated secrecy, tamper-protection or replay/relay advantage** from parser sharing. They preserve existing source-withholding only under the trusted SCO server assumption; authorized same-account output relay is still possible. Do not promote this intermediate result to `results/`, and do not call the pilot a universal runtime improvement or release candidate.

**Reproduction:** dispatch the manual-only fresh-process workflow twice, first with `immutable_batch=true`, then `false`, preserving exact branch source; run `node --test test/sco-immutable-batch-args.test.js` and strict external JSDoc. The separate mutable/default and read-only/frozen contracts require explicit application admission before use.
