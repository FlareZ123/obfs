# Stage 1 reference-role path correction (23 November 2026)

**Status: intermediate engineering evidence.** This research affects only the
read-only Acorn lexical resolver in
`workplace/agent1-lexical-reference-resolver.js`. It is not consumed by the
COO/SNO/SCO production compiler and proves neither source secrecy nor the
2.5× runtime limit.

## Counterexample

The old `referenceRole` inferred a write for **every identifier** inside the
source span of an assignment or for-of left-hand side. That predicate conflated
an actual assignment target with *evaluated subexpressions* inside its syntax:

- `window.value = 1`: the binding `window` is read as a receiver; the member
  reference is assigned.
- `({field: target = window} = item)`: `target` is written while `window`
  is read as a default initializer.
- `({[fn(window)]:target}=item)`: `window` is an argument evaluated to
  compute a destructuring property key; it is read.
- `for (window.value of items) {}`: the member reference is written while
  `window` remains a receiver read.

The official [ECMAScript assignment-pattern semantics](https://tc39.es/ecma262/2026/)
and [MDN destructuring reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring)
distinguish the target from computed keys and default initializer expressions.
The fix follows each identifier's *actual immediate AST branch* toward the
outer assignment and stops when it enters a member receiver/index,
default-expression right-hand side or computed property key. Direct binding
writes, compound assignments, updates and computed-Identifier key roles
remain explicitly classified.

## Reproducible red/green receipts

1. Red-first test file `test/agent1-reference-role-destructuring.test.js`
   at commit `84b855e666d70a9a0937540f987595e122144fcf` adds 16
   independent role-path assertions. Ubuntu and Windows Node 22 focused
   [run 45250146992](https://github.com/FlareZ123/obfs/actions/runs/45250146992)
   **failed as expected**, including actual `window:write` versus expected
   `window:read` for member receivers and default-evaluation paths.
2. Source patch
   [9525c4a43265aaa5a32bfba594cc65f7259afbc7](https://github.com/FlareZ123/obfs/commit/9525c4a43265aaa5a32bfba594cc65f7259afbc7)
   changed the ancestry test to inspect immediate child-branch identity.
   The same focused Ubuntu/Windows job
   [45250337770](https://github.com/FlareZ123/obfs/actions/runs/45250337770)
   **passed**.
3. The new test was then included in `jsconfig.external.json` at
   `6e76ca683a34c37fafd258942799828b77a767d3`. A fresh exact
   two-platform main source `74b2645f1013b752adb95a3dfbebb17ac4444cd7`
   passed the 16-role regression and strict project/external/budget JSDoc
   [45250552368](https://github.com/FlareZ123/obfs/actions/runs/45250552368).
   Separate focused baseline Stage 1
   [45250661514](https://github.com/FlareZ123/obfs/actions/runs/45250661514)
   and 150-pair Acorn/TypeScript
   [45250669100](https://github.com/FlareZ123/obfs/actions/runs/45250669100)
   also passed both operating systems at that same pin.

## Boundaries and next use

The test records the explicit `ReferenceRole` contract for a finite,
syntactically diverse set of writes and read subexpressions. It does not prove
whole-program variable alias safety, effect equivalence, reflection safety,
cross-file ownership, host identity, mutation resistance, or native behavior
under all syntax. The existing source-observer integration remains **NO-GO**
until Agent 3's separate pipeline-wide veto/provenance criteria are met.

Agent 6's draft [PR #344](https://github.com/FlareZ123/obfs/pull/344)
proposes independent class-name spelling coupling, ESM syntactic-label
exclusions and direct-delete binding roles. Any eventual adoption of that
donor must retain this AST-branch distinction; its branch still contains
the old span-containment logic as of this report.


## Independent native binding-effect oracle (19:57 UTC extension)

The AST-only expected-role assertions above are supported by an independent
runtime observation surface in
`test/agent1-reference-role-native-effects.test.js`. It executes **16
sloppy classic-script fixtures** in separate `node:vm` contexts with
instrumented configurable `globalThis.window` and `globalThis.target`
getters and setters. It checks the resulting `get`/`set` event sequence
against the expected read/write operations while checking the Acorn Stage 1
role list. The corpus covers simple, compound, update and member assignments;
object destructuring defaults and computed keys; `for...of` member/default
targets; and nested writes inside defaults. The independent event logging
does not invoke the obfuscation transform.

- Source `test/agent1-reference-role-native-effects.test.js` committed
  `45fd4a55c4d4ffb4a83f9463ca6e7017db977b74`;
  strict external JSDoc test inclusion
  `ce78c134e22de4e6512775c5519a01703eb865ad`.
- Two-platform Node 22 focused
  [45254009587](https://github.com/FlareZ123/obfs/actions/runs/45254009587)
  passed on **Ubuntu and Windows**, all **16/16** fixture groups, strict
  project/external/budget typechecks. Full Node runner skipped.
- This models the observable ECMAScript global-property reference operations
  for the named cases. It neither exercises lexical TDZ, proxies or accessors
  other than configured globals nor proves all AST language patterns,
  arbitrary native host identity, compiler equivalence, confidentiality or
  the project-wide performance budget.
