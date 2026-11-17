# SCO opt-in immutable batch arguments: correctness and cost experiment

**Agent:** Agent 1. **Date:** 2026-11-17. **Classification:** intermediate
engineering experiment on a restricted server-side JSON-RPC contract. No
claim of strengthened source obfuscation, online-cloning resistance, or a
universal 2.5× runtime bound.

## Hypothesis and boundaries

The default `src/sco.js` authenticated recognized-batch path reparses
an already valid JSON body into three independent graphs: outer
`authorizeOperation`, inner operation authorizers, and private execution.
This preserves the original mutable JSON argument values in the task even
if a trusted integrator callback rewrites its own policy view. For private
methods that explicitly accept **read-only** JSON arguments, a single
iteratively deep-frozen parsed graph may supply all three consumers without
allowing an authorization callback to redirect previously checked work.

The opt-in `immutableBatchArgs:true` setting applies only when
`authorizeOperation` is configured and the selected function is a
recognized `createScoBatchMethod`. It freezes every nested JSON object and
array before the first operation authorizer can observe it. Direct RPC
methods and the default path are unchanged. A handler configured with the
option but without `authorizeOperation` refuses construction.

This intentionally changes behavior for any method or callback that writes
an argument, checks extensibility or inspects frozen descriptors. It is an
API migration requiring explicit opt-in, **not** a transparent preserving
compiler transformation. Strict-policy mutation errors become generic HTTP
500, while private batch operation mutation errors become ordinary generic
per-item failures. Frozen input prevents mutation of the checked graph
inside the trusted process; it does not enforce permission correctness,
isolate concurrent policy state, prevent an authenticated online relay,
or protect against a compromised server.

## Reproducible evidence

The branch `agent1-sco-immutable-args-20261117` contains
`test/sco-immutable-batch-args.test.js` (six native HTTP regressions),
`sims/sco-immutable-batch-profile.js` (actual authenticated loopback
requests to default and frozen batch handlers, alternating order, nine
samples of 30 requests per mode), source and documentation.

The first two-platform workflow [44121601855](https://github.com/FlareZ123/obfs/actions/runs/44121601855)
at `8b1c052f` passed the behavioral checks and Ubuntu Chromium checks,
but failed **strict external JSDoc** on new Promise callback annotations.
Those errors were corrected without weakening the checker. The second
pinned [SCO workflow 44122057304](https://github.com/FlareZ123/obfs/actions/runs/44122057304)
at `ff499081299747dab16aed134a74e80040984e34` passed on **Ubuntu
and Windows Node 22**, including the new behavior/mutation regressions,
strict base/external JSDoc checks, selected SCO challenge tests and
Ubuntu Chromium SCO cases.

Selected authenticated localhost HTTP results from that exact source
(commit `ff499081`), medians of nine separately timed 30-request samples:

| Operations/batch | Body bytes | Windows frozen/default | Ubuntu frozen/default |
| ---: | ---: | ---: | ---: |
| 1 | 154 | 0.9638× | 1.0087× |
| 20 | 2,539 | 1.0106× | 0.9568× |
| 60 | 7,579 | 0.8813× | 0.9644× |

These samples show **small and noisy whole-HTTP differences** despite
avoiding two parse operations. They are contrasts against the existing
SCO server path, not against the original untransformed application.
They exclude remote WAN RTT, TLS, client startup and actual heavy private
work. The temporary local parser-only microbench was favorable to freezing,
but no independent source-pinned parser-only output is claimed here. The
frozen and default policies expose different argument mutability; workloads
must be audited before either configuration is a compatible baseline.

A follow-up branch-only profile raises valid size to 128/256/512
operations and configures `maxCalls:1024`, with the largest JSON request
occupying 64,943 bytes under the handler's 65,536-byte default byte limit.
Manual two-platform run for this subsequent profile was pending when this
report was first written. Its outcome should be reviewed before making
a deployment recommendation.

## Current decision

Treat this as a **bounded experimental optional contract**.
The verified behavior covers an intentionally pure argument model and
selected deep/negative-zero/`__proto__` inputs. Current whole-HTTP
throughput evidence does not establish a material security advantage or
deployment-wide speed gain. Preserve default independent mutable graphs
for general JSON-RPC methods. For any read-only contract, measure the
entire representative private workload, simultaneous client/server cost
and authorized relay behavior before selecting the option.
