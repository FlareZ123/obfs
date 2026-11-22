# SCO hostname routing: bounded positive cache and CPU-side control

22 November 2026. **Intermediate performance and compatibility evidence**.
The comparison concerns the SCO HTTP Host *routing prefilter* alone; it does not
measure obfuscated application compute, the whole HTTP request, private RPC
execution or a security advantage against a hostile client.

## Motivation and implementation

As part of [WHATWG IPv4 alias normalization](whatwg-ipv4-host-alias-2026-11-22.md),
the SCO routing prefilter switched from a string split to a WHATWG URL parser.
A repeated identical Host value is typical during a browser session, but
parsing it afresh on every request adds avoidable server CPU work.

`src/hosts.js` now exposes `createRoutingHostResolver(allowed)`:
it makes its own allowlist snapshot and stores **only previously permitted raw
HTTP Host strings**, in a bounded set of **128** entries. Successful repeats
return the same routing decision without reparsing. Unrecognized or malformed
headers are always checked from scratch; rotating among more than 128
permitted spellings causes predictable eviction and revalidation.
`src/sco.js` creates one resolver per handler instance. The cache
does **not** cache `authorizeRead`, `authorizeRpc`, or
`authorizeOperation` outcomes, and all those callbacks still run for every
applicable request.

[Focused real-HTTP and resolver test 45043955887](https://github.com/FlareZ123/obfs/actions/runs/45043955887)
at `e9c4a72473e1c8879f9717aca8de23f05858d808` passed all
three tests and both strict JSDoc gates on Ubuntu/Windows. It covers valid
aliases, malformed and disallowed fields, 256 sequential permitted Host
spellings across eviction, denial, and three consecutive authenticated-read
checks with a repeated Host, whose statuses were 200, 403, 200.

## Matched CPU-side observations

[Source-pinned profile 45044009321](https://github.com/FlareZ123/obfs/actions/runs/45044009321)
at `a038304d74f575d74743ac9a7b987e100aea74a7` passed on both
Ubuntu and Windows with Node 22.23.4. The test is reproducible through
`test/sco-host-cache-cpu-profile.test.js`: seven alternating-order pairs per
workload, 100,000 in-process routing decisions per arm, exact acceptance
counts and recorded raw elapsed samples. The conventional control runs the
same current `routingHostname` parser and compares its normalized result
against the same `Set`, without an approved-spelling cache.

| Workload | Ubuntu cached/control median | Windows cached/control median |
| --- | ---: | ---: |
| Same allowed DNS Host repeatedly | 0.01257× | 0.01030× |
| Same allowed shortened IPv4 alias repeatedly | 0.01566× | 0.00990× |
| 160 rotating allowed ports, larger than cache | 1.34929× | 1.21188× |
| Same rejected Host repeatedly | 1.10880× | 1.09618× |

For the repeated permitted Host, the cached prefilter is substantially
faster **only within the measured CPU micro-operation**. A pathological
stream of unique permitted spellings is slower than the uncached resolver
because of cache insertions and evictions; rejected Host traffic is
also slightly slower due to the additional cache lookup. The negative
controls are retained rather than suppressed. These ratios are NOT an
application-level 2.5× ceiling test, a network speedup, a throughput claim
or incremental obfuscation protection.

## Boundary

`Host` is an untrusted, spoofable request header and the cache grants no
identity or permission. Authorization still requires trusted server-side
policy callbacks; repeated requests cannot reuse the result of an earlier
authorization. A different caller's allowed spelling does not open an
unlisted route. The cache lifetime is the handler lifetime, and it never
stores a denied Host as an accepted value.

Future performance evaluation should compare full generated SCO requests,
including Node HTTP and authorized private work, with a same-trust ordinary
service under paired CPU measurements. This scoped result warrants no
change to the primary **RELEASE-BLOCKED** security decision.
