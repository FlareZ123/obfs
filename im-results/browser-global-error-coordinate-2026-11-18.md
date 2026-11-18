# Browser global error and promise-rejection coordinate observers

**Agent 8, 18 November 2026. Status: intermediate semantic-correctness evidence.**

## Boundary

Browser runtime error delivery exposes generated source coordinates through
standard global events even when the compiled JavaScript never reads
`Error.stack`.

For synchronous runtime errors, `Window.onerror` receives line and column
arguments directly, while `Window.addEventListener("error", ...)` receives
an `ErrorEvent` with `lineno` and `colno`. The HTML Standard defines
those values as the script location of the error. For unhandled promise
rejections, the global `unhandledrejection` event carries a
`PromiseRejectionEvent.reason`, which can be the original Error object.

References:
- https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event
- https://html.spec.whatwg.org/multipage/webappapis.html
- https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event
- https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent/reason

The obfuscator already rejected explicit `.stack` observers and, after the
earlier host-lock repair, applied that source-observer proof before adding the
hostname prefix. It did not classify these browser-global event channels.

## Frozen counterexample

Branch `agent8/browser-error-event-red-20261118` preserves the pre-repair
compiler. The final red harness source is
`21d7a6fe3a34869faf3ccd8d4b498ba385e2240a`.

The page supplies the actual event handlers outside the compiled file. The
compiled JavaScript only registers those host functions and triggers the
runtime error. This distinction is intentional: earlier local-callback
fixtures were already rejected by existing function-source escape guards and
were discarded as confounded probes.

Manual run
[44384044610](https://github.com/FlareZ123/obfs/actions/runs/44384044610)
established the two synchronous channels under real headless Chrome:

```text
global-onerror     native 3:6 -> generated 5:6
global-error-event native 3:6 -> generated 5:6
```

The generated program differed only because the requested host-lock wrapper
inserted source before the supplied script. The harness also proved that a
separate non-observing program still emitted and successfully executed a real
host lock on the authorized hostname.

The extended red run
[44384901354](https://github.com/FlareZ123/obfs/actions/runs/44384901354)
added the external unhandled-rejection channel:

```text
global-onerror              native 3:6  -> generated 5:6
global-error-event          native 3:6  -> generated 5:6
global-unhandled-rejection  native 3:16 -> generated 5:16
```

All three counterexample assertions passed in real Chromium. The Windows job
also passed the non-browser portions and strict JSDoc.

## Repair

`src/ast.js::observesFunctionSource` now treats these as source-coordinate
observers:

- assignment to global `onerror`, `onunhandledrejection`, or
  `onrejectionhandled`;
- global `addEventListener()` registration for `error`,
  `unhandledrejection`, or `rejectionhandled`;
- direct or computed `lineno` and `colno` member reads;
- `lineno` and `colno` destructuring reads.

The handler and event-name sets are allocated once per source-observer
analysis rather than once per AST node.

The browser harness is retained in
`sims/browser-error-coordinate-attack.js`. Its guarded mode expects the
compiler to fail closed when a host lock would prefix an observing program.
`test/browser-error-coordinate-observer.test.js` provides a root Node
admission regression and retains a safe positive that must still contain the
real host-lock denial path.

The final implementation pin for this report is
`a75794411bad60edbf4e11ffb2927adc1af4d0e5`. Focused and full validation
runs were dispatched as
[44385294797](https://github.com/FlareZ123/obfs/actions/runs/44385294797)
and
[44385303652](https://github.com/FlareZ123/obfs/actions/runs/44385303652).
Their final status must be recorded here before treating the repair as fully
validated.

## Scope and limits

This is semantic compatibility work. It does not add confidentiality,
tamper-resistance, authorization strength, static-analysis resistance, or
dynamic-extraction resistance.

The new classification is intentionally conservative. A user-defined object
with properties named `lineno` or `colno` can now cause a source rewrite
to be declined. Likewise, a global error-event registration is rejected even
if its particular callback never reads the coordinates. That precision cost
is preferable to publishing a demonstrated coordinate mismatch.

Opaque host consumers that observe runtime errors without any registration or
coordinate read in the supplied source remain a broader contract boundary.
Cross-file Worker error events also need separate graph-aware reasoning before
any claim that source-coordinate observation is complete.

The release verdict remains unchanged.
