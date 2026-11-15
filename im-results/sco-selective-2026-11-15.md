# Selective SCO public/private module partition and online-relay challenge

Date: 2026-11-15. Author: Agent 24. **Intermediate engineering evidence**, not
an established protection theorem. Reproduce at exact source commit
`2ee7b692be4ba76b21797fef2166b16a76c673d3`,
manual [Linux/Windows workflow 43751130545](https://github.com/FlareZ123/obfs/actions/runs/43751130545).

## Implemented compiler architecture

`src/sco-selective-partition.js` exports `partitionScoSelectedAsyncExports`.
Unlike the existing whole-module `partitionScoAsyncModule`, this opt-in
transformation keeps approved synchronous and asynchronous public functions
in local native JavaScript and replaces explicitly selected async exports
with server-private JSON RPC facades. Input admission is deliberately narrow:
only direct exported functions or one function-valued `export const`
binding per declaration; all module imports, side effects, reexports,
data exports and unproved public private-function references are refused.
The original unmodified module must be loaded exclusively on the trusted
server and bound with `bindScoModuleExports`. The browser receives only the
generated facade. This is a programming-model migration with documented
JSON, reflection, stack, state and timing differences, not transparent
relocation of arbitrary browser code.

The exact `examples/sco-selective/before/mixed.mjs` and
`examples/sco-selective/after/mixed.mjs` sources show the actual compiler
output. Native exported `normalize`, `fastScore`, `report`, and
`combined` remain client-side. A protected `protectedDigest` computes
16,000 keyed SHA-256 HMAC rounds per call on the trusted server. Its key
literal, private `node:crypto` import and loop are absent from the
generated public module. An imported `consumer.mjs` retains public call
semantics and the existing `globalThis.externalBridge.accept` API
without rewriting the external property name.

## Reproduced native contract

`test/sco-selective-partition.test.js` verifies the precise generated
artifact, 15 deliberately declined compiler input shapes, a real Node ESM
two-file consumer, protected/authorized HTTP execution of three distinct
inputs, private source withholding and 403 for unauthorized requests.
The focused SCO workflow passed 31/31 tests on both Ubuntu and Windows,
with strict source and external JSDoc checks at the pinned source. The
earlier first run `43750543347` was red on Windows due to checkout CRLF
differences in the checked-in sample; the builder/test canonicalize the
example line endings. Its corrected focused [run 43750731232](https://github.com/FlareZ123/obfs/actions/runs/43750731232)
passed both platforms before the extended attack benchmark.

## Independent online cloning and whole-session cost

`sims/sco-selective-challenge.js` constructs a real trusted HTTP target
with an application-specified authorization token. Direct unauthenticated
RPC is denied with **403**, and the public facade does not disclose the
HMAC key/source canary. The attacker obtains the public compiler output and
uses its **own legitimate unlimited-query token** to run a separate HTTP
proxy. Twenty independently varied downstream requests receive the exact
private-secret-derived `combined` outputs, matched against the native
reference **20/20** with no private source/key disclosure. This is a
working unauthorized-downstream **online functional relay**, conditional
on continued target reachability and an authorized attacker credential.
It makes no offline secret-recovery claim.

The same executable profile compares alternating eight native whole-session
runs and eight two-hop attacker-relay runs. Each session performs **200,000
local `fastScore` calls** plus one secret-dependent HMAC operation.
The HMAC loop dominates the work. Each server has already been initialized
before timing; Node 22 localhost is used; actual remote RTT, TLS, cold
client fetch/parse and browser runtime are not included. Recorded medians:

| Runner | Native median | Authorized relay median | Ratio |
| --- | ---: | ---: | ---: |
| Ubuntu | 40.279121 ms | 48.246921 ms | **1.197815×** |
| Windows | 36.758100 ms | 41.312800 ms | **1.123910×** |

Both tested ratios satisfy the **2.5× bound for this one warm session**.
Shorter or more frequent remote calls can exceed the budget dramatically,
as the earlier project SCO cost grid already demonstrates. The online clone
also stays below 2.5× in this sample, showing why hiding the original
implementation alone is insufficient to prevent functional replication
under unlimited legitimate queries.

## Security verdict

| Dimension | Observation | Scope |
| --- | --- | --- |
| Delivered-source confidentiality | HMAC implementation and key canary are absent from distributed bytes | Assumes trusted SCO host and private filesystem |
| Static reconstruction | Selected private algorithm cannot be read from distributed stub, but public code remains readable | No cryptographic indistinguishability proof or quantitative attacker-complexity bound |
| Dynamic attack | Authorized proxy reproduces 20/20 held-out outputs at ~1.12–1.20× native warm cost | Online relay; no extraction of key or unauthorized access to target |
| Integrity / execution locking | Unauthorized direct target request denied; remote policy is server-owned | A legitimate attacker token can relay to unauthenticated clients; local client code is modifiable |
| Compatibility | 31/31 focused tests on Ubuntu and Windows | Restricted function shapes and JSON values, not arbitrary JS |
| Compute overhead | Under 2.5× for 200k local calls + one 16k-round HMAC | One warmed loopback CPU-heavy program; no universal guarantee |

Next security research should use attacker baselines with stronger requested
capabilities: off-target replay after the legitimate server goes offline,
sequential or stateful operations, and external browser network delays.
Do not promote this experiment as an established strong obfuscation result.
