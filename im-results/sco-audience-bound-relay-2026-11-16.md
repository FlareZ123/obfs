# SCO per-principal private-result binding versus authorized online relay

**Agent 26, 16 November 2026.** This report is an intermediate
architecture and attacker-game result. It does not assert general anti-relay
security or a universal 2.5× runtime bound.

## Security question and construction

SCO can keep a private implementation and 256-bit random HMAC key on a
trusted Node.js server, but [existing authorized-relay evidence](./sco-large-domain-prf-2026-11-15.md)
demonstrates an attacker with legitimate account credentials can forward
unbounded queries through the honest server. We ask a narrower question:
**Does an attacker authorized for account A reproduce the private output
which the same server would compute specifically for account B?**

The executable [audience-bound attack game](../sims/sco-audience-bound-relay.js)
starts a real HTTP `createScoHandler` with a compiler-generated public ESM
RPC facade. The private HMAC operation uses a fresh random server-only key
and 8 MiB of fixed work per call. Its authenticated message is
`"bound-rpc-v1" || 0x00 || verifiedAccountId || 0x00 || 128-bitChallenge || work`.
A trusted server-owned bearer-to-principal registry accepts distinct
256-bit random fixture tokens for accounts A and B. The HTTP
`authorizeRpc` and `authorizeOperation` gates enforce valid sessions,
method and argument shape; the protected method accepts only the
challenge, **never a caller-selected audience**.

A `createScoKeyedIsolation` scope serializes per-principal work and uses
Node `AsyncLocalStorage` to carry the independently verified principal
through a private async method. Both the secret key and original
implementation remain server-only, while the generated facade is
publicly inspectable to authenticated clients. A client may modify its
own code, but a token for A still resolves to A inside the trusted server.

The attacker runs a separate real HTTP proxy with only A's legitimate
token, no private source, no secret key and no B credential. It forwards
arbitrary downstream JSON RPC requests to the honest server and returns
the exact reply. This is an **online** attacker; the comparison is not
limited to a memorized challenge dictionary. Account B's independent
legitimate requests serve as the exact-output oracle for the test.
All 32 challenges are 128-bit hex encodings derived from labeled hashes,
outside the attacker's training observations.

## First pinned cross-platform observations

At immutable source commit
[`15c62e1ff144314eda71eea080622bda18c11fdb`](https://github.com/FlareZ123/obfs/commit/15c62e1ff144314eda71eea080622bda18c11fdb),
[CI 43834406330](https://github.com/FlareZ123/obfs/actions/runs/43834406330)
passed the existing SCO authorization workflow on Node 22.23.4,
including both platforms' strict in-scope checks and Ubuntu real
Chromium fixtures. The attack script itself reported:

| Observation | Ubuntu Linux | Windows |
|---|---:|---:|
| Held-out challenges | 32 | 32 |
| A proxy matches account A output | 32/32 | 32/32 |
| Direct authenticated B responses match B native | 32/32 | 32/32 |
| A proxy accidentally matches B output | 0/32 | 0/32 |
| Unverified request status | 403 | 403 |
| Forged second audience argument status | 403 | 403 |
| Native 12-call median, ms | 55.717276 | 63.995700 |
| Direct A RPC 12-call median, ms | 64.576182 | 76.098900 |
| A-proxy RPC 12-call median, ms | 72.049288 | 87.287100 |
| Direct/native ratio | 1.158997× | 1.189125× |
| Proxy/native ratio | 1.293123× | 1.363953× |

Nine alternated 12-call sessions per strategy were timed using local
process wall time. The baseline runs the *same private HMAC function*
directly, and direct/proxied paths include localhost HTTP request/response,
server-side per-principal isolation and authenticated policy checks.
All measured outputs were asserted exactly against the native baseline.

## What the experiment establishes and leaves open

The trusted server binds private output to an independently authenticated
principal for these fixture operations. Under the experiment's explicit
absence of B credentials, A's otherwise successful online relay does
**not** produce the B-audience digest. A's same-account relay remains a
perfect functional clone, **32/32**, so this does not prove arbitrary
anti-cloning or instrumented-client security.

This is application authorization semantics with an unforgeable
server-side key, **not** a property of client-side JavaScript
obfuscation. An attacker with B credentials, a cooperating B client,
a stolen B session, or an ability to induce B to make original-server
requests can still relay B outputs. A compromised SCO server can expose
the key or fake the principal context. The trial samples only 32
challenges and a specific HMAC construction; it is not a formal PRF
security proof. Real WAN RTT, TLS, concurrency, lock contention and
cold-start costs were not measured in this first pin.

The 1.16×–1.36× ratios satisfy the 2.5× ceiling for **this particular**
8 MiB work and loopback session shape. Tiny operations, WAN delays,
other workloads and one-call lifetimes can exceed 2.5×, as existing SCO
latency experiments show. A follow-up adds cross-account concurrent
async-context checks and explicit JSDoc coverage; the current pinned
table does not certify those later changes.
