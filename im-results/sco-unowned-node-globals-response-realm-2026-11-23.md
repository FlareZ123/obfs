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

## Extended native/syntax sweep and authenticated positive execution

The same source candidate was subjected to a deterministic **56-wrapper
native ESM differential**: seven Node-specific ambient expressions composed
through eight direct, array, local-value, closure, async-closure, getter,
record and conditional forms. Chromium and independent Node produced
different native results for **56/56** expression/shape pairs, and selected
SCO conservatively refused all **56/56** transformations. This is a
finite grammar test, with all input source strings in
`test/sco-app-global-native-browser.test.js`, **not** a theorem for
arbitrary syntax or dynamic aliasing.

The source-pinned [two-OS CI
45280947904](https://github.com/FlareZ123/obfs/actions/runs/45280947904)
at `6fe9b84d59e501569717b0b21a5aaaffe3ca063f` passed the
56-wrapper original-host check, all earlier focused tests, and strict
project/external/budget JSDoc. Ubuntu executed actual Chromium; Windows
executed compiler checks and intentionally skipped Chromium.

A subsequent generated-client **real HTTP** positive control directly
imported original browser ESM and selected SCO facade on the same Chromium
page. Three independently locally owned scalar spellings
`Buffer=41`, `process=41`, `Response=41` each computed `42` in
both original and server-RPC-selected code, and public `visible()`
returned `7`: native and emitted vectors were each
`[42,42,42,7]`. The handler enforced cookie auth, and a request to
`/obfs/rpc` without the authorization cookie returned **HTTP 403**.
[Focused 45281286475](https://github.com/FlareZ123/obfs/actions/runs/45281286475)
passed all 12 tests including this browser/HTTP scenario on Ubuntu, with
Windows static checks and strict JSDoc. Exact source is
`015e1f62281ccc2bdb3e54b80fc2fc082a3eceea`.
These are preservation and authorization-boundary checks, not
resistance to legitimate authorized online relaying.

An additional pre-existing fixture expected the old broad host-global
refusal diagnostic for `const globalThis=probe()`. The indexed
free-reference proof now correctly refuses the unowned free `probe`
earlier. Only that test's expected diagnostic alternative was extended
to include `unproved unqualified free reference: probe`; the unsafe
source remains refused and no runtime behavior is changed. The
[original focused red 45280767319](https://github.com/FlareZ123/obfs/actions/runs/45280767319)
reported 13 passing tests and this one mismatch on both OS;
[corrected focused 45281045333](https://github.com/FlareZ123/obfs/actions/runs/45281045333)
passed 14/14 with strict JSDoc on both OS at
`98ac8fd840e82b64b3bb776f93c23f1bed7af930`.

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
