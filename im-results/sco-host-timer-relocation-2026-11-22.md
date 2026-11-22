# Cross-realm timer-handle and callback admission in selective SCO (22 November 2026)

## Threat and semantic contract

A selected SCO async export runs on a trusted Node 22 server after being
partitioned from a browser ESM module. This can move host timer calls and
callbacks to a different event loop. The host APIs have observable differences:
[MDN Window.setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout)
returns a positive numeric timer ID, whereas
[Node timers documentation](https://nodejs.org/api/timers.html)
specifies a `Timeout` object. Thus a selected source such as

```js
export async function protectedOp(){
  const id=setTimeout(()=>0,1000);
  clearTimeout(id);
  return typeof id;
}
```

returns `"number"` in the browser and `"object"` in Node under
their normal timers APIs, despite both being JSON strings. Local Node
22.16.0 runtime observation and the host documentation support this
boundary; this experiment did not separately execute the source in
Chromium.

## Red-first and corrective evidence

The new targeted test in
[`test/sco-private-host-effect-closure.test.js`](../test/sco-private-host-effect-closure.test.js)
asserts refusal for direct and extracted timeout/interval calls, `queueMicrotask`,
browser animation-frame and idle-callback APIs. An ordinary private record
containing inert timer-like field labels remains admitted.

At source `340c129f53d42432fa20d85f46f5c6ae773d256f`,
the existing focused graph workflow
[44998557574](https://github.com/FlareZ123/obfs/actions/runs/44998557574)
reproduced a **missing expected exception** for the direct `setTimeout`
program on both Ubuntu and Windows Node 22.

The compiler's existing `usesUnprovedCrossRealmHostApi` scanner now
includes the host scheduling APIs `setTimeout`, `clearTimeout`,
`setInterval`, `clearInterval`, `setImmediate`, `clearImmediate`,
`queueMicrotask`, and recognized event-dispatch/callback globals.
The existing `browserOnlyRoots` guard owns animation-frame and idle
callback diagnostics because those names are already classified there.
This avoids two competing refusal messages for the same API.

The first follow-up graph workflow
[44998657791](https://github.com/FlareZ123/obfs/actions/runs/44998657791)
was red on both systems because a concurrent browser-only global regression
expected its pre-existing diagnostic for `requestAnimationFrame`. That
fixture had the correct refusal and the wrong diagnostic precedence.
We removed the redundant API names from the new host-scanner set, leaving
them to the existing browser-global guard; the own timer regression now
accepts either of the two precisely corresponding error classes.
The revised [run 44998773150](https://github.com/FlareZ123/obfs/actions/runs/44998773150)
at exact source `78734d570ceedd13aa056549b5ade28935474052`
**passed the targeted graph tests, generated graph checks and strict JSDoc
on both Ubuntu and Windows**. This report retains the actual red evidence
rather than presenting the first attempt as fully compatible.

## Recovering safe local protected work

The initial timer-name refusal was overly broad for locally owned code.
For example, a selected private body containing

```js
const setTimeout = value => value + 1;
return setTimeout(41);
```

has a lexical function binding unrelated to browser timers. A red-first
positive-yield regression at
[source e794b6d576067c23ca1dbfcc3070e8a202cce3bf](https://github.com/FlareZ123/obfs/commit/e794b6d576067c23ca1dbfcc3070e8a202cce3bf)
in [CI 44999001142](https://github.com/FlareZ123/obfs/actions/runs/44999001142)
confirmed the previous compiler incorrectly refused this safe case on
Ubuntu and Windows.

The `usesUnprovedCrossRealmHostApi` proof now reuses
[`collectBindings`](../src/properties.js) and admits one uniquely bound
immediate-scope function declaration or `const` function expression under
a host API spelling. Unknown, nested or multiply declared bindings are
still declined, and accesses to actual ambient host APIs remain subject
to the other source scans. A shared concurrent change temporarily
introduced duplicate imports of `collectBindings`; the first follow-up
[CI 44999092296](https://github.com/FlareZ123/obfs/actions/runs/44999092296)
failed at startup with `SyntaxError: Identifier 'collectBindings' has already been declared`.
The combined source now imports it exactly once.

The next complete targeted graph
[CI 44999206226](https://github.com/FlareZ123/obfs/actions/runs/44999206226)
at `3cf66723001e868d65766fab341cbf44da60cd3a`
passed **73/73 test cases on both platforms**, generated graph checks and
strict JSDoc. It includes selected direct helpers, module-local helpers in a
reviewed private static ESM dependency and conservative nested-shadow
negative controls.

A follow-up native-versus-generated positive fixture was added to
[`test/sco-selected-handler.test.js`](../test/sco-selected-handler.test.js).
It imports the actual original protected ESM module, starts the compiler-owned
SCO handler, verifies that the protected local function body is absent
from the served facade, checks denial without the session header and
compares five native calls against the generated module's authenticated
loopback-RPC results. The matching
[CI 44999326745](https://github.com/FlareZ123/obfs/actions/runs/44999326745)
at `817e010230e70fe9acde89bebaa807ad4d064a2f`
passed **74/74 cases on Ubuntu and Windows**, generated graph checks
and strict JSDoc.

This is actual protected-work execution evidence in the Node integration
harness. It does not establish the unchanged host's full browser execution
contract, nor does a local renamed helper prove a security or speed gain.

## Explicit server-owned imports and primitive constants

The host-name check also originally refused intentionally server-owned,
lexically unambiguous bindings such as
`import {setTimeout} from 'node:timers/promises'` with
`allowServerImports:true`. This import returns a Promise and is deliberately
different from the browser-global callback timer. Likewise, a primitive
top-level `const setInterval=42` is a scalar server constant, with no
timer side effect. Both proved positive admission cases were red on
Ubuntu and Windows in
[CI 44999946196](https://github.com/FlareZ123/obfs/actions/runs/44999946196)
at exact source `84bbc411af69555d3cea343c5e6a6342b456f463`.

The scanner now accepts only names in the already validated immutable
server-owned binding set with a single declaration across the parsed module,
using `collectBindings(ast)`. The explicit Node builtin import still
requires the existing `allowServerImports:true` policy, while local
primitive constant admissions use the established compiler rules.
Nested or duplicated binding names do not inherit the exemption. A
negative control confirms omission of the server-import opt-in is refused.

The focused [CI 45000025444](https://github.com/FlareZ123/obfs/actions/runs/45000025444)
at exact source `d44d107c2cfd1cd2bdcd8d94499e14e626c20fed`
passed **79/79 tests**, generated graph checks and strict JSDoc
on both Ubuntu and Windows. This improves the selected compiler's
supported source subset under an explicit server-trust boundary.

## Scope and remaining proof obligations

The scanner is deliberately syntactic and conservatively declines shadowed
local names where their host independence is not proven. It also blocks
recognized first-class host function extraction, rather than assuming a
callback's eventual host can be inferred from the argument list. These
checks apply to selected private bodies and compiler-audited private ESM
sources; a non-audited opt-in server-only dependency retains its documented
review contract.

This is a conservative compiler admission improvement. No emitted work is
added to accepted code by these checks. A universal 2.5x runtime guarantee,
browser/Node semantic equivalence for arbitrary unrecognized host APIs,
anti-extraction, anti-relay or strong obfuscation claim remains unsupported.
The primary release decision is still **RELEASE-BLOCKED**.
