# Selected SCO Node-only ambient relocation and Response host-base boundary

**Date:** 23 November 2026. **Status:** intermediate source-admission
correctness research on branch `agent35/sco-known-node-ambient-parity-20261123`. **Current selected compiler
candidate:** `d195af1033b71797c06f63bca7dfbafa8335c196`, extending the
earlier unmerged indexed lexical-proof candidate. No mainline merge, current-main
full integration receipt, general attacker-cost advantage, or release approval.

## Native source contract and falsifier

The selective SCO compiler moves reviewed browser-origin private ESM functions
to a trusted Node.js server. Because ordinary Chromium does not expose Node's
unqualified `Buffer` and `process` globals, an original browser function
reading these names can throw while a successfully admitted Node version
returns a value. Existing static host-effects checks already prevent many
other Node ambient accesses, including `globalThis.Buffer` and
`globalThis.process`, but the generalized free-reference checker classified
both free spellings as recognized globals.

The directly executed original source, in both Node 22.23.4 and actual
Chromium 157, included:

```js
export async function protectedOp() {
  return Buffer.byteLength("ab");
}
export function publicOp() { return 0; }
```

Node yielded `2`, while browser evaluation yielded `ReferenceError`,
with `typeof Buffer === "undefined"`. The compiler admitted this selected
body before the guard. A **test-only red-first** Ubuntu Chromium and Windows
source-pin `e6a45a6680057ad731ecbef5b81aeb6ca55ff34b` reproduced it
([run 45278635312](https://github.com/FlareZ123/obfs/actions/runs/45278635312),
Ubuntu failure `Missing expected exception`).

A wider native control exercised `globalThis.Buffer`, unqualified/process
member variants, `global`, `globalThis.global`, and
`setImmediate`/`clearImmediate`; all seven browser/Node outputs differed.
Among these, only free `process` remained compiler-admitted after the
`Buffer` correction. The strict two-OS red-first
[run 45279159360](https://github.com/FlareZ123/obfs/actions/runs/45279159360)
at `a49cdc7c7b6ed0a9cf2c73f56a757cad82d96119` reported
`admitted=["process"]`.

## Candidate guard and positive controls

The new `firstUnprovedUnqualifiedReference` parameter
`allowServerNodeGlobals=false` removes unqualified free `Buffer` and
`process` from a short syntactic recognized-name exemption **only in
browser-selected private functions/helpers**. It preserves actual lexically
owned values, including `const Buffer=41`, `const process=41`, and
function parameters, through the preceding scope proof. Audited static
`privateModuleSources` are explicitly declared server-owned dependencies and
pass `allowServerNodeGlobals=true`, preserving reviewed Node-only imports that
use both Node `Buffer` and `process`. This is a conservative admission
restriction on source compilation; it does not insert runtime checks or change
the execution overhead of accepted artifacts.

The `Buffer` correction and positive controls passed [two-OS focused
run 45278953375](https://github.com/FlareZ123/obfs/actions/runs/45278953375)
at `c990cfc25758995dd1882e4675f71a49a521325a`.
The broader `Buffer` plus `process` guard passed
[two-OS focused run 45279377836](https://github.com/FlareZ123/obfs/actions/runs/45279377836)
at `770771b6dca988e343f87b5c8def700dcb840af2`,
including Ubuntu real Chromium and strict project/external JSDoc.
Failures in the two **red-first** test-only pins are expected historical
falsifiers, not current green receipts.

## Independent Response.redirect base-URL finding and integration

Agent 18 independently identified that relocated
`Response.redirect("/next",302).headers.get("location")` uses the browser
document's base URL yet throws a URL parse error under Node. Their real
authenticated Chromium SCO workflow [red 45278723892](https://github.com/FlareZ123/obfs/actions/runs/45278723892)
and [green 45278917817](https://github.com/FlareZ123/obfs/actions/runs/45278917817)
establish the scoped native-versus-transformed mismatch and minimal host API
admission refusal. See
[their detailed report](sco-response-redirect-relative-2026-11-23.md).

Our combined donor adds `Response` to the existing
`usesUnprovedCrossRealmHostApi` inventory so direct selected and audited
private dependency calls decline; its own focused regression checks both.
One new positive control discovered that the inherited name-only host API
guard overrefused an inert `const Response=41`. The candidate admits **only
a uniquely bound, immutable primitive literal** named `Response` in an
immediate source scope, in addition to its established locally owned function
exemptions. No arbitrary object, reassigned binding, alias, external source,
or browser host `Response` value is newly trusted.

The current code-source also passed [two-platform selected-graph
45279978395](https://github.com/FlareZ123/obfs/actions/runs/45279978395)
and [audited private-static-graph fuzz
45280150990](https://github.com/FlareZ123/obfs/actions/runs/45280150990),
with strict project/external JSDoc on both operating systems.

The initial combined selected/Response test was red solely on that positive
control ([45279727422](https://github.com/FlareZ123/obfs/actions/runs/45279727422),
9 passes/1 fail on Ubuntu), then a narrow local-literal repair passed focused
selected/source tests and strict JSDoc at
[45279928501](https://github.com/FlareZ123/obfs/actions/runs/45279928501)
from compiler source `d195af1033b71797c06f63bca7dfbafa8335c196`.

## Reproduction and limits

- [Combined focused test](../test/sco-app-global-native-browser.test.js)
  exercises real Chromium native ESM and independent Node ESM for the
  mismatched globals; selected and transitive audited private graph refusal;
  same-name lexical scalar positive controls.
- [Compiler source](../src/sco-selective-partition.js) carries bounded
  source admission guards. The generalized lexical index predates this
  experiment and remains an unmerged research donor.
- The full three-mode security objective is still **RELEASE-BLOCKED**.
  This experiment prevents selected cross-runtime semantic mismatches for
  tested syntax, but provides no increase in resistance to static recovery,
  authenticated SCO online relaying, attacker instrumentation, hostile owner
  integrity bypasses, or unauthorized environment cloning.
- Native Chromium versus Node versions, browser-owned application globals,
  built-in mutations, indirect aliases, and implicit native coercions require
  additional adversarial checking. Only a finite set of native controls is
  evidenced. No universal 2.5× claim is supported; this is compiler admission,
  not a workload-level runtime benchmark.
- Source-pinned focused CI is not a full integration gate. Existing comprehensive
  mainline correctness and adversarial acceptance remains separate under
  Agent 10 and canonical source-observer integration under Agent 3.
