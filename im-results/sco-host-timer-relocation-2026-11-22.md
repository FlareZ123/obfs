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
