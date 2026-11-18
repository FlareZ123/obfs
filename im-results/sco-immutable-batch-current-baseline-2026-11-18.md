# Current-baseline SCO read-only batch parse sharing: source-pinned matched HTTP experiment

**Agent 1, 18 November 2026. Intermediate engineering performance/compatibility evidence; no general obfuscation advantage.**

## Mechanism and immutable provenance

[Draft PR #107](https://github.com/FlareZ123/obfs/pull/107) adapts the optional `immutableBatchArgs:true` read-only registered-batch contract to current `createScoHandler`, after Agent 9's default independently parsed policy arguments (merged PR #88). On an opt-in recognized batch, the handler freezes one parsed JSON graph before calling either operation policy and the private batch, avoiding two further full-body `JSON.parse` operations. Default `false` retains separate policy views, and direct nonbatch RPC semantics are unchanged. The opt-in is a deliberate API-contract change, requiring all policy callbacks and private operations to treat their input graphs as immutable.

**Source pin:** exact new implementation and documentation revision `581181233e69638251f4ef0d5a76ab45ed59f2d2` for `src/sco.js` with a later docs-only source pin at `92711399b44f1999f2eed540a1519248c1fa1e9b` that initially contained a duplicate forwarded property and failed strict TypeScript. The corrected executable source is `581181233e69638251f4ef0d5a76ab45ed59f2d2`. The corrected [manual two-platform SCO regression 44283939529](https://github.com/FlareZ123/obfs/actions/runs/44283939529) completed **successfully** on both Ubuntu and Windows Node 22, including behavior, HTTP mutation gates, primary/external strict JSDoc, runtime benchmarks and Ubuntu Chromium. The earlier [run 44283275803](https://github.com/FlareZ123/obfs/actions/runs/44283275803) passed behavioral and Chromium steps but failed strict JSDoc `TS1117` due accidental duplicate `immutableBatchArgs` in the forwarded object literal. This explicit earlier failure is part of the evidence, not a green result.

## Paired authenticated local HTTP observations

Both arms use the same registered `createScoBatchMethod` read-only `read` operation, method allowlist and HTTP loopback, comparing default copied-policy JSON to opt-in shared frozen JSON. The harness constructs independent local HTTP servers, warms both, tests 6 payload sizes (1, 20, 60, 128, 256, 512 registered calls), and uses 9 alternated-order pairs of 30 sequential authenticated loopback POSTs per arm per size. The table reports a ratio of **separate arm medians** (immutable/default), followed by the minimum/maximum of corresponding paired per-sample ratios; values below 1 mean opt-in response faster for that selected workload. All recorded outputs returned 200 and passed expected response-shape assertions. The harness lacks a separate original native application control; no 2.5× original-vs-protected claim follows.

| Platform | Calls | JSON bytes | Default median ms/request | Frozen median ms/request | Frozen / default | Paired ratio range | >2.5× pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | 1 | 154 | 0.5745 | 0.6167 | 1.073× | 0.886–1.384× | 0/9 |
| Ubuntu | 20 | 2539 | 0.5049 | 0.4932 | 0.977× | 0.830–1.469× | 0/9 |
| Ubuntu | 60 | 7579 | 0.5394 | 0.4897 | 0.908× | 0.732–1.436× | 0/9 |
| Ubuntu | 128 | 16175 | 0.6286 | 0.5839 | 0.929× | 0.817–1.105× | 0/9 |
| Ubuntu | 256 | 32431 | 0.8453 | 0.7192 | 0.851× | 0.773–0.907× | 0/9 |
| Ubuntu | 512 | 64943 | 1.3127 | 1.0705 | 0.816× | 0.737–0.914× | 0/9 |
| Windows | 1 | 154 | 0.8552 | 0.8522 | 0.997× | 0.849–1.336× | 0/9 |
| Windows | 20 | 2539 | 0.7702 | 0.7096 | 0.921× | 0.797–1.410× | 0/9 |
| Windows | 60 | 7579 | 0.7975 | 0.7803 | 0.978× | 0.620–1.231× | 0/9 |
| Windows | 128 | 16175 | 0.9202 | 0.8037 | 0.873× | 0.749–1.451× | 0/9 |
| Windows | 256 | 32431 | 1.2879 | 1.1050 | 0.858× | 0.827–0.931× | 0/9 |
| Windows | 512 | 64943 | 1.9164 | 1.5851 | 0.827× | 0.663–1.437× | 0/9 |

At 512 operations (~64.9 KB payload), opt-in ratio of medians is **0.816× Ubuntu** and **0.827× Windows**. At one operation, it is **1.073× Ubuntu / 0.997× Windows**. The parser-saving benefit is size-dependent; these are small local HTTP response times subject to scheduling noise. All 108 paired sample ratios (2 OS × 6 sizes × 9 trials) were under 2.5× between variants, but they are **not** original-vs-obfuscated compute-budget observations.

## Security, compatibility and limits

The `Object.freeze` contract changes visible descriptors and strict-mode write behavior and may produce generic RPC failures when authorizers/private operations mutate their arguments. Sharing the parsed graph also changes argument reference identity between policy and executor. Opt-in tests include nested arrays/objects, own `__proto__` JSON fields, numeric `-0`/overflow, 5,000 levels of nesting, policy mutation refusal, private mutation failure and direct nonbatch invariance. There is no protection against the authorized online relay, no demonstrated new static or runtime anti-analysis advantage, and no unqualified JavaScript 1:1 equivalence across arbitrary RPC clients. The source-only COO/SNO hostile-runtime boundary and existing cross-mode release-blocking 2.5× observations are unchanged.

**Reproduction:** `node --test test/sco-immutable-batch-args.test.js`, `node sims/sco-immutable-batch-profile.js`, and the manually dispatched `.github/workflows/manual-sco-authorization.yml`. Full mainline corpus, slow-network cost, database-backed operations, multi-process concurrency and type/exact source-pin tests are separate checks.
