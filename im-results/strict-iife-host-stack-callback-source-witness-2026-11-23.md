# Strict ESM IIFE external host stack-coordinate observation, 23 November 2026

**Classification:** intermediate **red** semantic-parity evidence for a source-transforming COO compiler candidate. No safe compiler fix, mainline acceptance or strong-obfuscation advantage has been established. Global status remains **RELEASE-BLOCKED**.

## Reproduction and controls

A strict ESM immediately invoked arrow executes `globalThis.HOST_STACK_SPY(owner.longPrivateFieldForHost)`, where its own function object is neither stored nor exported. The host callback receives the primitive number 47, invokes `new Error('host source observer').stack`, and extracts its ESM caller's line and column. Because the compiler renames the private field and reduces preceding source length, the host can distinguish the native and compiled invocation through V8's native frame column. This violates 1:1 externally observable JS behavior despite matching numeric results.

The callback never reads the IIFE function object or `Function#caller`. Thus the strict-mode restriction on recovering the function object through the legacy caller accessor does not settle stack-coordinate preservation.

**Pinned actual compiler / test-only branch** [agent39/host-stack-callback-iife-20261123](https://github.com/FlareZ123/obfs/tree/agent39/host-stack-callback-iife-20261123), based on main `eb2cb90960848f19a47e75b1aec5dc779f9cace6`, test-only SHA `2b694c5d08f877fe848ca4e9c42d6ea560f9a1b6`, file `test/host-callback-strict-iife-stack.test.js`. [Existing focused two-platform workflow 45148478509](https://github.com/FlareZ123/obfs/actions/runs/45148478509) failed the **same** exact parity assertion on Node 22.23.4 Ubuntu and Windows:

| OS | Original | Actually compiled |
| --- | --- | --- |
| Ubuntu | `{value:47,line:1,column:71}` | `{value:47,line:1,column:62}` |
| Windows | `{value:47,line:1,column:71}` | `{value:47,line:1,column:62}` |

An independent positive control in this exact test permits an actual **one-property rewrite** inside a strict ESM IIFE when the result is read locally without the external host source observer. This proves that the tested compiler is performing useful private-owner work rather than merely copying the source. The host callback graph's numeric output remains exactly 47 on both arms. A preliminary red [45148368774](https://github.com/FlareZ123/obfs/actions/runs/45148368774) was caused by the test's too-narrow assumption about the V8 stack callsite offset (71 vs assumed 60); this was corrected before the definitive paired red `45148478509`.

## Implications and proof boundary

A rule that treats a direct strict IIFE as source-private solely because its callable object cannot escape is insufficient under the stated arbitrary host-callback observation model. A user- or host-provided callback can log a stack frame, even without reference access to the caller. The compiler must establish a source-coordinate-preserving transformation or decline to rewrite a source region that could invoke this observer. A specific one-off callback name check is not a general solution: aliases, imported callbacks, nested host objects and callback indirection all merit explicit flow proofs.

The test uses one same-line Node 22 ESM source and a locally injected `globalThis` callback. It does not establish the general outcome for browsers, imported callbacks, arbitrary program graphs, dynamic source extraction, security under hostile instrumentation or the 2.5x runtime ceiling. A future fix needs both a real negative host source-coordinate regression and a nonzero safe private-owner positive transform. It also needs full current-main integration and independent review.

This is consistent with [V8's Stack Trace API](https://v8.dev/docs/stack-trace-api): strict mode restricts retrieval of caller function/receiver objects but still exposes frame locations. [MDN documents Error.stack](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack) as a widely implemented nonstandard source of location data.

**Disposition request:** Agent 10 and canonical Agent 3 should inspect this actual red source and decide whether to port a narrowly proved sink guard, develop a more general host provenance model, or defer while retaining the release veto. Avoid interpreting absence of `caller` visibility as a complete source-observation proof.


## Bounded guard trial and demonstrated yield cost (09:59 UTC)

A compiler patch on this **research branch only** broadens `observesFunctionSource` to conservatively refuse source-changing edits in the presence of directly accessed host-global properties and their simple identifier aliases. This is a monotone may-flow guard, **not** a complete interprocedural host-provenance proof. Source `5ec519aefa2f7e169a5909dacebf7422829fb24c`, [focused two-platform run 45150794178](https://github.com/FlareZ123/obfs/actions/runs/45150794178): **5/5 focused tests pass on Ubuntu and Windows, with strict JSDoc checks**. The direct host callback now emits unchanged source; the private strict IIFE without an opaque host still rewrites one owner property.

The necessity of covering accesses rather than calls alone is separately falsified. A first call-only guard at `14b15269b10fdab8d930c6040d5faccbe6bd33cb` passed the direct caller test, but the host-owned accessor on `globalThis.HOST_STACK_VALUE` changed its native stack column from **102** to **82** despite having no explicit callback invocation; [red 45149633159](https://github.com/FlareZ123/obfs/actions/runs/45149633159), test-only source `0b9fc22f34726fd45d4bf047753e469c18756881`. The direct-member guard then failed for `const host=globalThis; host.HOST_STACK_SPY(...)`, whose externally observed columns changed **87→78**; [red 45150466221](https://github.com/FlareZ123/obfs/actions/runs/45150466221), test-only source `0b9fbcc606aa3f44cc14546af4bd4c706c04935b`. The later alias tracker covers only direct/simple identifier may-flow.

**This broad guard has a demonstrated positive-yield cost.** One exact native `globalThis.Math.PI` fixture and test file were run on a frozen pre-guard control and the guarded research branch. Under the test's **explicit pristine native Math global premise**, source is the same:
`const owner={longPrivateFieldForHost:47};const value=owner.longPrivateFieldForHost;export const observed=value+globalThis.Math.PI;`

| Source pin and two-platform CI | Source observer | Private property rewrites | Outcome |
| --- | --- | --- | --- |
| Control `aee6b0d675e5d1d4748b79adebc4df33ff6c5f55`, [45151730650](https://github.com/FlareZ123/obfs/actions/runs/45151730650) | false | **1** | Both OS green |
| Guarded `722e452efd7b9db4b93abe89810324acabe159fb`, [45151736917](https://github.com/FlareZ123/obfs/actions/runs/45151736917) | true | **0** | Both OS red against the *same* positive-yield expectation |

The same-node diagnostic printed `{"fixture":"native-Math-owner","sourceObserver":false,"properties":1}` in the control and `{"fixture":"native-Math-owner","sourceObserver":true,"properties":0}` in the trial. This is a legitimate safety/utility policy tension: `globalThis.Math` is normally a standard global data property, but an attacker-controlled realm may redefine it as a source-capturing getter. Any optional trusted-native allowance must state and verify its environmental assumption. Existing SCO selected-private migration already uses a separate ECMAScript global allowlist plus realm checks in `src/sco-selective-partition.js`. Blind duplication into general COO source preservation would not prove hostile-host equivalence.

A four-file `test/interfile.test.js` check failed `crossFile.objects=0` on both the frozen original control [45151088168](https://github.com/FlareZ123/obfs/actions/runs/45151088168) and the guarded trial [45151046069](https://github.com/FlareZ123/obfs/actions/runs/45151046069). **Do not** attribute this pre-existing red to the new guard: the exact-parent candidate comparison cannot isolate it.

## Constructive source-coordinate-neutral counterexample

A separate **research-only AST-span edit** in `test/host-callback-strict-iife-stack.test.js` changes an owner key to `_r7` and pads replacement identifier tokens with ordinary spaces to preserve each original UTF-16 span length. Under the restricted single private owner and same-line strict ESM fixture, Node returned primitive 47 on all arms. Native host callback observed frame column **71**, a naive shorter source key changed the column to **49**, and the width-balanced, renamed output retained column **71** with the old field spelling absent. [CI 45150232904](https://github.com/FlareZ123/obfs/actions/runs/45150232904) passed on both OS with strict JSDoc; the equality also reproduced locally on Node 22.16.0. The repository compiler **does not use this edit strategy** in production.

The bounded text-position property is elementary: edits to nonoverlapping, newline-free source spans that replace each span with exactly equal UTF-16 length preserve all later token offsets and line/column coordinates. It does not preserve `Function.prototype.toString`, source-file bytes, function names in stack traces, error message operand spelling, arbitrary host callback behavior, or correctness of alias/property ownership; each needs independent proof. This is a promising **candidate direction**, not an academically established security result.

**Disposition:** retain all red and green evidence on research branches. **Do not merge the broad global guard** as a universal source-observation solution, because the exact-source Math test quantifies lost safe transform yield. Route the gap and tradeoff to canonical Agent 3 and Agent 10. An accepted implementation needs an explicit host-provenance/trust contract or a correctly scoped source-coordinate-preserving pass, plus comprehensive integration and the 2.5× and adversarial evaluations. Global release remains **RELEASE-BLOCKED**.
