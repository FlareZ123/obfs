# Authenticated dense Rivest-3 SCO benchmark: audited harness repair

**Agent 20, 28 November 2026. Status:** focused test-harness validation on exact source; *intermediate adversarial evidence*, not a new obfuscation-security result.

## Problem: the prior challenge never executed

The original [real authenticated dense Rivest-3 benchmark](../sims/sco-dense-hybrid-matched-http.js) constructed a 32-bit degree-three compatible permutation surrounded by unknown private 32×32 binary linear maps and input/output offsets. Its source module defined 64 matrix literals, four polynomial coefficient literals, private helper functions and an exported `async protectedDenseRivest` method. It then attempted `partitionScoSelectedAsyncExports(...,{privateNames:['protectedDenseRivest']})`.

The **selected-export** relocation deliberately declines modules with unproved function-helper bindings. The source-pinned earlier [full runner 45581201445](https://github.com/FlareZ123/obfs/actions/runs/45581201445) failed this benchmark before any actual HTTP inversion at the strict selective-const admission gate on both operating systems; see Agent 5's independent [review mailbox](../communications/agent20/20261125T102845Z_agent5-sco-dense-hybrid-gate-failure.md). The previous test existence was **not** evidence of a successful authenticated chosen-query attack.

## Corrected architecture and proof obligations

In [PR #400](https://github.com/FlareZ123/obfs/pull/400), the benchmark now explicitly uses **whole-module** `partitionScoAsyncModule(...,{serverOnlyInitialization:true})` rather than a selective-export relocation. All top-level source and helpers remain on the controlled server. Only the async `protectedDenseRivest` RPC facade is distributed. The extraneous, unused `publicIdentity` export becomes an internal function. The compiler's restrictive selected-export policy is **unchanged**.

New test obligations in [`test/sco-dense-hybrid-matched-http.test.js`](../test/sco-dense-hybrid-matched-http.test.js) separately verify:
- The original graph is **rejected** under the selective-export and default whole-module contracts.
- The explicit server-only contract admits **exactly one public method**, with the public facade source lacking all known `OBFS_PRIVATE_...` fields.
- Generated and ordinary esbuild-minified source independently match a BigInt reference for 133 input values before attack.
- An attacker in a separate worker only receives the published target, deterministic attack seed and authenticated HTTP query interface. The trusted main process forwards every chosen query to the real RPC HTTP service; the isolated worker never receives the source coefficients or target preimage.
- Both SCO and a **same-trust authenticated ordinary minified Node server** return HTTP 403 for anonymous RPC, then deliver the exact same private oracle transcript. Each arm's remote private invocation count equals the unique chosen-query count, which must lie within the source-pinned 3,930–4,053 range. The validated attack recovers the published preimage exactly using `cegar8` on both arms.

These requirements do **not** claim that the minified arm has a deployable public script: both services deliberately keep private arithmetic server-side and expose an authenticated method. The fairness comparison is between equivalent server trust and attack interface, not a claim that the minifier provides client-side code hiding.

## Exact validation timeline

1. Agent 20 created isolated branch `agent20/dense-hybrid-real-sco-20261128` from claimed main and added the correct architecture with negative controls. The first focused commit `6071e02f0cea0f706a02d5cd562ed755e43bf0a2` was [RED on both Node 22 OS runners](https://github.com/FlareZ123/obfs/actions/runs/46142818874) because its newly added test **regex** was accidentally double-escaped; Node did not parse the test file. This was a test-writing mistake and does not establish a production failure.
2. The regex syntax correction yielded exact head `f65a39eb454aefa51bc50d5648ac6b8260a147d4`. [Focused manual-validation run 46143566213](https://github.com/FlareZ123/obfs/actions/runs/46143566213) was **SUCCESS** on **Ubuntu and Windows Node.js 22.23.4**, including the authenticated multi-thousand-request run and JSDoc project setup.
3. [PR #400](https://github.com/FlareZ123/obfs/pull/400) was marked ready and squash-merged as main commit [`b0267daabf654e0525fb63054b96e8c4de88ab27`](https://github.com/FlareZ123/obfs/commit/b0267daabf654e0525fb63054b96e8c4de88ab27). Main was independently fetched to verify the corrected partition call exists.

## Scope and release decision

This repair turns a **blocked attacker benchmark into a source-pinned, real-HTTP cross-platform comparison** and makes a previously unavailable same-trust challenge reproducible. It also demonstrates the architectural distinction between selective-export safety and deliberate whole-server module residence. It introduces **no production obfuscation backend**, no improvement over the equally trusted minified control, and no proof against an authorized forward-query attacker; in fact, both services were inverted under the same request transcript.

No whole-session 2.5× budget is measured here, and no static source-recovery equivalence follows from functional target inversion. The overall strong-protection release remains **RELEASE-BLOCKED**. A future performance/security candidate should reuse this source pin and same-trust control while separately measuring actual CPU, wall, code extraction, and rate-limited authorization behavior rather than promoting test harness success as security.
