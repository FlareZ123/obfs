# Default unhandled rejections expose transformed source coordinates

**Date:** 2026-11-19  
**Agent:** 50  
**Classification:** intermediate compatibility evidence; asynchronous host-observer boundary.

## Finding

Node 22's default unhandled-rejection mode is `throw`. When a rejected Promise has no handler, Node raises the rejection as an uncaught exception. The default uncaught-exception behavior prints the stack trace to stderr and exits nonzero.

A JavaScript program can therefore expose generated source coordinates without containing a `ThrowStatement`, reading `Error.stack`, installing a process hook, or calling a diagnostic formatter.

Official Node 22 documentation:

- https://r2.nodejs.org/docs/latest-v22.x/api/cli.html documents `--unhandled-rejections=throw` as the default.
- https://nodejs.org/download/release/latest-jod/docs/api/process.html documents that an unhandled rejection can become an uncaught exception and that the default uncaught behavior prints the stack trace to stderr and exits with code 1.
- The same process documentation notes that a rejection can acquire a handler later, so “unhandled” is inherently time-dependent.

## Reproducer

`sims/unhandled-rejection-source-boundary.js` compiles a one-line SNO source with identifier and string transforms disabled:

```js
'use strict';
const owner={distinctivelyLongPrivateField:73};
const value=owner.distinctivelyLongPrivateField;
const fail=globalThis.__fail;
if(fail)Promise.reject(new Error('probe'));else console.log(value);
```

The host sets `globalThis.__fail` before evaluating the same source.

With `false`, native and emitted programs both succeed and print:

```text
73
```

With `true`, the Promise rejection is left unhandled. The program contains no explicit `throw` syntax on this path. Node's default policy turns the rejection into an uncaught exception and prints its source frame.

## Source-pinned evidence

Validation head: `a03ef324c80916b91a1046a638a9c9235379aaf6`.

Manual implicit-source run **44455093455** passed completely on Ubuntu and Windows, including the existing source-observer differential suite and strict JSDoc.

The Ubuntu workflow reported for this probe:

```json
{"propertyRewrites":1,"successStdout":"73\n","nativeColumn":184,"transformedColumn":152,"diagnosticMismatch":true}
```

The same run also re-executed the previously merged opaque null-member boundary independently at columns 175 and 143.

Thus the unhandled-rejection specimen has:

- a genuine private-property rewrite;
- an input arm with equal successful behavior;
- an asynchronous failure arm with equal rejection reason semantics;
- different host-visible stack coordinates solely because emitted source before the rejection site is shorter.

## Why the explicit-throw guard does not cover this

The current bounded source-observer guard recognizes a `ThrowStatement` that can escape the nearest local catch. An `async` function that literally executes `throw new Error(...)` therefore already falls under that syntax guard.

`Promise.reject(new Error(...))` creates the same host-level uncaught-exception outcome under the default Node policy without any `ThrowStatement`. There was no Promise-specific source observer in `src/ast.js` at this source pin.

Adding a blanket veto for every `Promise.reject` call would still be an incomplete semantic proof. Node explicitly permits a rejection handler to be attached later, and the global Promise constructor/method can itself be replaced or shadowed. Whether a particular rejection reaches the host is a temporal and environment-sensitive property.

## Architectural implication

This result strengthens the dynamic-input boundary already demonstrated for ordinary member access. Source-coordinate compatibility depends on runtime failure delivery as well as syntax.

A sound high-yield design needs an explicit policy for host-generated diagnostics. Plausible directions remain:

- effect analysis with verified host and built-in contracts;
- a semantic contract that excludes exact host-generated source coordinates;
- source-layout transformations that preserve relevant locations;
- runtime mediation that prevents transformed coordinates from escaping.

This evidence does not justify a blanket transformation refusal and does not establish an impossibility theorem. It records a second, asynchronous mechanism by which exact host behavior can reveal emitted layout.
