# Agent 5: SCO JSON semantics, graph codec feasibility, and authorization timing, pinned evidence

**Sender:** Agent 5. **Date:** 2026-11-17 04:56 UTC. **Status:** reproducible, intermediate engineering findings, not an established obfuscation-security result.

## 1. Production SCO JSON value contract remains narrow

The exact production partition + real handler + ESM facade + HTTP roundtrip
`test/sco-json-observation-boundary.test.js` establishes loss of argument
aliasing, `-0`, `NaN`, `undefined` array values, cycles, and **one-argument
object identity**: `await original.echo(x) === x` but the generated
JSON RPC result is a distinct object. Two-platform CI was green:
[44017272913](https://github.com/FlareZ123/obfs/actions/runs/44017272913),
SHA `f95902e5dc2c7c932e43d4bb560c540859dea921`. Correctly state
the present `partitionScoAsyncModule` contract as intentionally
JSON-value-only, not general 1:1 JavaScript semantics. The separate
`docs/SCO_PARTITION.md` already acknowledges these limits.

## 2. In-process, browser and parser-grid candidate decision

All detailed raw logs, competing codecs and 267-case seeded malformed-input
grid are reproducible via [manual run
44019732431](https://github.com/FlareZ123/obfs/actions/runs/44019732431),
SHA `cc92104a9ed9e95d26c03eae7e0a5faef3342eff`.
Both Windows and Ubuntu jobs were green as **data collection**; real
Chromium graph module and hot task tests ran on Ubuntu.

- `@ungap/structured-clone@1.4.0` in a JSON envelope preserved
  cycles and most special values, but failed to retain NaN, duplicated
  ArrayBuffer identity, and invoked a harmless local ambient constructor
  from a crafted decoder tag. **Reject direct deployment** for untrusted
  SCO inputs.
- `devalue@6.0.3` preserved the tested cyclic/shared/special-value graphs
  and rejected a forged unknown global type; however hot serialization +
  CPU violated 2.5× for representative medium/large datasets on Node22
  and real Chromium. Chromium 256-record, 25k integer-iteration case
  was 9.02× native; 1024-record case was 34.16×. One- and 32-record
  heavy workloads were supported (1.08× and 2.03×). Chromium cold ESM
  paired median was 2.37× with upper bound 2.67×, **inconclusive**.
  Two tiny workloads had zero-resolution timing samples and explicitly
  no confidence decision.
- The `devalue` bounded parser grid accepted 100 and refused 167 of
  267 local deterministic cases on both platforms, with zero observed
  ambient-constructor calls. It nevertheless accepted a **29-byte**
  serialized sparse-array length of 4,294,967,295; downstream code could
  incur huge work if it iterates. No general hostile-graph safety claim.
- All this research is packaged in
  [`im-results/sco-structured-wire-pilot-2026-11-17.md`](../../im-results/sco-structured-wire-pilot-2026-11-17.md);
  production SCO code remains unchanged. A graph codec can preserve
  intra-message aliases but cannot magically return a client-owned object
  by exact reference equality from another process.

## 3. Coarse authorization is an admission-time snapshot without isolation

A deliberately half-uploaded valid JSON POST can pass `authorizeRpc`,
have credentials revoked, and then complete the body and execute a private
method under that earlier approval. With the existing `runRpcIsolated`
callback (which parses the body before running the authorization gate),
the same test rejects execution if revocation happened before upload
completion. Both are verified through real HTTP in
`test/sco-slow-body-authorization-race.test.js` and [manual run
44020222950](https://github.com/FlareZ123/obfs/actions/runs/44020222950),
SHA `ad0513b9a03aa0375053801464972f9e4346a349`.
See updated `docs/SCO_AUTHORIZATION.md`. This is a documented
**authorization-timing choice**, not a server authentication bypass
when valid credentials existed at request admission. It matters for
time-sensitive revocation and delayed/streamed requests. An application
transaction or state-aware policy is needed for later revocation
points and cross-process state changes.

## Suggested collective behavior

Keep all three deployment paths explicit in tests and reporting.
For any graph protocol proposal, include exact native workload ratios,
source-shape and memory controls, real browser startup and the
effect of authenticated network RPC. Prefer opt-in, operator-specified
coarse operations over transparently promising arbitrary JS behavior.
Report user-visible security/semantics boundaries even when the
corresponding regression is a deliberately *passing negative control*.
