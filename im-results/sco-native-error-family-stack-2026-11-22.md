# SCO native Error-family stack relocation, 22 November 2026

## Scope and verified result

A bounded compile-time correctness guard in `src/sco-selective-partition.js`
extends the existing selected-private/error-origin admission proof to
`DOMException` and the `WebAssembly.CompileError`,
`WebAssembly.LinkError` and `WebAssembly.RuntimeError` families.
These native Error-like constructors expose a `.stack` string that embeds
the execution source filename/call site. SCO relocation can change this
string when source is moved from a browser module to a Node server module.

This prevents a known false admission when the selected exported function
or audited static private dependency reads that stack through direct
construction, a local Error alias, or a simple WebAssembly constructor alias.
The native `.name` positive control remains eligible.

## Native Node 22 evidence

The following `node:vm.runInNewContext` probe executed each expression under
source filenames `browser-client.mjs` and `server-private.mjs`.
`DOMException` was injected as an identical trusted host constructor
into each VM context, since bare Node VM contexts do not define it by default.
WebAssembly Error families were context-local native constructors.

| Expression | Observation |
| --- | --- |
| `new DOMException('tag','InvalidStateError').stack` | Includes `at f (browser-client.mjs:1:21)` versus `at f (server-private.mjs:1:21)`; strings differ |
| `new WebAssembly.CompileError('tag').stack` | Different call-site filename, strings differ |
| `new WebAssembly.RuntimeError('tag').stack` | Different call-site filename, strings differ |
| `new DOMException('tag','InvalidStateError').name` | `InvalidStateError` in both, strings equal |

These are native **Node V8 realm** observations, illustrating the cross-host
source-filename mechanism. They are not proof that every supported Chromium
version exposes an identical stack API; they establish a compiler admission
counterexample under the server runtime and a plausible browser migration
hazard. As a reference, MDN documents [`Error.prototype.stack`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack)
as nonstandard and implementation-dependent.

## Source-pinned red and green

The [red-first two-platform workflow 45005042157](https://github.com/FlareZ123/obfs/actions/runs/45005042157)
at `0d68601c0e3ec0f4ed3bb9b5370426de414998b2`
failed on Ubuntu and Windows at the first required refusal:
`Missing expected exception: return new DOMException('tag','InvalidStateError').stack;`.
The red test had two DOMException cases and a stable `.name` control.
The later WebAssembly tests were added after this pin; the red workflow
does not establish their individual previous acceptance.

The correction and final six negative cases plus one safe positive control
were run on the focused
[Ubuntu/Windows SCO graph workflow 45005216160](https://github.com/FlareZ123/obfs/actions/runs/45005216160),
exact source/test commit `deb13b96951940fb9c3b34f10ec9556c4fc0dd98`.
Both jobs **passed**, including existing generated facade/graph tests and
strict SCO-graph JSDoc.

Coverage spans selected `partitionScoSelectedAsyncExports` and two depths
of audited `privateModuleSources` through `partitionGraph`.
The new classifier recognizes direct constructors, `const W=WebAssembly;
const E=W.LinkError` and destructured `const {RuntimeError:E}=WebAssembly`
within the static fixed-point alias model. The existing error-origin
tracking checks the `stack` access; ordinary unrelated `stack` property
reads and stable `DOMException.name` stay admitted.

## Boundaries

Only compiler admission changes; generated runtime code for successfully
admitted source is unchanged, so no per-call compute instructions were added.
This does not demonstrate a security barrier against instrumentation or
runtime extraction, and no universal 2.5× bound follows. Direct/indirect
native constructors outside the explicit families, reflection, proxy
instrumentation and opaque interprocedural Error carriers remain unproved.
The shared first-class free-reference work on Agent 40's open PR #272
requires separate integration and broad validation. The primary strong
obfuscation objective remains **RELEASE-BLOCKED**.
