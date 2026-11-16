# Application-scale SCO withholding, online relay, and cost granularity

**Intermediate software/security evidence (2026-11-16).** The pinned
[Linux/Windows Node 22.23.4 manual gate 43806967633](https://github.com/FlareZ123/obfs/actions/runs/43806967633)
passed at exact source `b0c759fec74580c5b2ae906bb0367ce221c90db1`.
The previous [pre-snapshot gate 43806776603](https://github.com/FlareZ123/obfs/actions/runs/43806776603)
also passed, but generated the facade during CI rather than verifying the
checked-in byte-for-byte output. Only the newer gate tests the committed output
without regeneration.

## Threat boundary and code publication

The [frozen COO source application](../examples/application-challenge/before/)
comprises a stateful arithmetic engine with two imported configuration keys,
browser-like `window.externalValue` host call, and a dynamically reflected
independent schema. The original algorithm is synchronous, so the
[dedicated async wrapper](../examples/application-challenge/sco-before/api.mjs)
provides a separately declared JSON-RPC contract:
`evaluateRemote(seed,count): Promise<Result>`.

The original five ESM implementation modules remain under
`examples/application-challenge/before/`, loaded by the trusted Node
server via the wrapper. The [actual generated client](../examples/application-challenge/sco-public/sco-before/api.mjs)
is **515 bytes**, exports one async function, and contains one opaque method
identifier plus a relative `/obfs/rpc` fetch helper. It does not include
the original arithmetic, configuration keys, host callback, or reflected
schema implementation. The [SCO graph compiler](../examples/application-challenge/sco-build.cjs)
selects only `sco-before/api.mjs` as public; all five dependencies remain
private. The server uses an exact `publicPaths` allowlist.

[Server](../examples/application-challenge/sco-server.cjs)
routes public source and RPC through a fixture bearer header. It checks
token bytes, method identity, numeric seed bounds (0 to 2^32-1), and
bounded operation count (0 to 150,000). Direct private source requests
return 404 even for an authenticated user, and unauthorized RPC calls
return 403. The bearer token is a test fixture rather than a recommended
real-world authentication scheme. Deployment policy, transport
certificate validation, bearer theft, replay control, and legitimate-use
quotas are outside this experiment.

## Behavioral and attacker comparison

Both operating systems passed all 36 native-vs-facade differential calls.
The [public-only attacker worker](../sims/application-challenge-sco-relay-child.cjs)
was launched in a separate Node process with an isolated temporary copy
of only the emitted 515-byte facade, the original server URL, and a
legitimate session token. It had no private source arguments or
cryptographic key. Using the original authorized server as an online
oracle, it reproduced **40/40 genuinely held-out outputs**. This is a
working *online functional clone*, without source reconstruction or key
extraction. The worker is not an OS-secure sandbox: only its actual input
bytes and imported files were controlled. A hostile machine with the
server's filesystem is outside the SCO threat model.

In the original frozen COO output, all six files remain public and
untransformed; the [companion negative-control report](application-challenge-refusal-2026-11-16.md)
documents direct full source disclosure. The SCO facade is materially
stronger for source withholding, and offers no demonstrated resistance
to unlimited authorized online relaying.

## Paired hot-work and thin-call measurements

The [test/profiler](../test/application-challenge-sco.test.js) alternated
nine paired native and facade calls for each of two workload sizes after
warmup. Loopback transport was HTTP/1.1 on 127.0.0.1. Server initialization
was separately recorded and, under the prompt's SCO server-side setup
exception, was excluded from the repeated-request runtime ratio.
These are noisy finite samples, without WAN RTT, TLS handshake, browser
scheduling, user concurrency or whole deployment measurement.

| Test, nine paired hot medians | Ubuntu | Windows |
|---|---:|---:|
| Native 120,000-event compute | 1.6624 ms | 2.1982 ms |
| RPC 120,000-event compute | 2.3894 ms | 3.5914 ms |
| RPC/native heavy ratio | **1.4373×** | **1.6338×** |
| Native 1-event compute | 0.00528 ms | 0.00820 ms |
| RPC 1-event compute | 0.70536 ms | 1.3878 ms |
| RPC/native thin ratio | **133.62×** | **169.24×** |
| Measured server initialization | 11.09 ms | 30.54 ms |

The measured 120,000-event local test meets 2.5× on both systems, whereas
the one-event workload fails dramatically. Separate warm measurements
do not prove the full application session under network deployment,
where per-request latency and client initialization cannot be ignored.
Private source withholding alone does not change the attacker’s ability
to submit authorized operations to the real service.

## Reproduction and next questions

The pinned test invokes
`node examples/application-challenge/sco-build.cjs --check --dump` and
`node --test test/application-challenge-sco.test.js`. The emitted
facade is checked in and exact matched on both operating systems,
including explicit LF .gitattributes for cross-platform byte stability.
All client outputs are compared after the JSON wire serialization
boundary, preserving the intended remote contract.

The highest-value next experiment is an independent attack that tries
source recovery or a *standalone* held-out clone without contacting the
original server under a fixed query budget. An attacker with unlimited
legitimate requests already has an online clone here. Network RTT/TLS,
authorization, multi-session operation, and sustained cloud concurrency
must be separately bounded before production claims.
