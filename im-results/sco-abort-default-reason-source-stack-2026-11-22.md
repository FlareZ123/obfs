# SCO default-abort-reason source-stack admission, 22 November 2026

## Defect and scope

Selected SCO functions and audited private ESM dependencies are moved from
one JavaScript source location/realm to a trusted Node process. The existing
native-Error stack guard did not recognize a DOMException generated indirectly
when `AbortController.abort()` or `AbortSignal.abort()` is called without
a defined reason. The `reason.stack` can include a different executing
module filename, violating the source's observable returned string.

This is a **compile-time admission correction**. It does not change emitted
JavaScript or add runtime instructions to sources that pass the stricter
preflight. It is limited to syntactically recognized constructor/controller
aliases, direct calls and first-class method extracts.

## Observable counterexample

Node 22 `node:vm.runInNewContext` was run with filenames `client.mjs`
and `server.mjs`, providing the same native `AbortController` and
`AbortSignal` constructors to each context. The following expressions
returned unequal `string` stacks with their respective filenames:

- `const c=new AbortController();c.abort();return c.signal.reason.stack;`
- `const c=new AbortController();c.abort.call(c);return c.signal.reason.stack;`
- `const c=new AbortController();const stop=c.abort;stop.call(c);return c.signal.reason.stack;`
- `const stop=AbortSignal.abort;return stop().reason.stack;`

A paired control with `c.abort('safe');return c.signal.reason` returned
`safe` in both. The source of the native default value is independently
documented by [MDN's AbortController.abort](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort)
and [AbortSignal.reason](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/reason):
an omitted reason creates an `AbortError` `DOMException`.
The test is a native V8 filename/realm witness, **not** a full Chrome/Node
HTTP relocation test.

## Red/green chain

1. Added direct and aliased AbortController/AbortSignal default-error stack
   cases plus matched explicit-reason positives. The
   [two-platform red test 45005911210](https://github.com/FlareZ123/obfs/actions/runs/45005911210)
   at `0cc7127dfcc65f9e4478471efa911a2c415dad99`
   failed Ubuntu and Windows with `Missing expected exception:`
   for `controller.abort();return controller.signal.reason.stack;`.
2. Introduced a bounded fixed-point constructor/controller-instance alias
   collector within `realmStateObservation`, recognizing direct or global
   Abort constructors and simple `const` / assignment relays. Literal
   non-undefined primitive reasons remain accepted. The
   [first corrected two-platform gate 45006093151](https://github.com/FlareZ123/obfs/actions/runs/45006093151)
   passed at test source `d13fbcf1de456044766915848776fbea41099ce0`,
   including six negative and five positive source bodies across selected
   and audited graph depths.
3. Added three additional first-class method-extraction counterexamples.
   The [red 45006175902](https://github.com/FlareZ123/obfs/actions/runs/45006175902)
   at `625d3f62ff6ac8838f3ad71e1c0d7eceb8a8bc0b`
   failed both OS for `controller.abort.call(controller)`. Direct
   `.abort` property reads on tracked controllers or `AbortSignal` that
   are *not* a proven direct call are now conservatively declined as
   first-class escapes; the direct primitive-reason cases remain admitted.
4. The [final green targeted SCO graph workflow 45006254506](https://github.com/FlareZ123/obfs/actions/runs/45006254506)
   passed Ubuntu and Windows at exact compiler/test SHA
   `3bcb28bf97bdab6fbfe5850cdd85014d4272d61a`. It includes
   generated SCO example checks, all existing private graph/handler suites,
   these nine negative and five positive bodies at direct and both
   private-graph depths, and strict SCO graph JSDoc.

The unsafe corpus is intentionally conservative: a dynamic reason may
evaluate to `undefined`, so the known-safe direct form requires exactly
one ordinary non-RegExp primitive literal. Calls through opaque aliases
remain outside complete proof. First-class native abort method escape is
refused even when the eventual use might supply a benign reason.

## Security and performance limitations

The result prevents a demonstrated source-file-sensitive compatibility
misadmission. It does not establish that all cross-realm native Error
carriers are detected, that runtime instrumentation is frustrated, or that
COO/SNO hostile runtimes can be locked. Other host side effects, such as
`AbortSignal.timeout` scheduling, require separate analysis. The compile-time
check adds no per-call runtime instructions for any still-admitted source,
but there is no universal 2.5× performance claim. The project's overall
strong-protection release decision remains **RELEASE-BLOCKED**.
