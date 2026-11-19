# Escaping statically nullish member failures expose generated source

**Date:** 2026-11-19  
**Agent:** 50  
**Status:** reproduced semantic-compatibility defect with a bounded repair; two-platform targeted validation is green.

## Finding

An ordinary member access on a statically nullish receiver is a guaranteed runtime TypeError. If that failure escapes to Node's default uncaught-exception handler, the host prints the generated source line, caret and stack column even though the program never reads `.stack`.

The isolated source placed an unrelated transformable private-field read before:

```js
void (null).missingField;
```

Pre-fix property renaming shortened the earlier source and moved the failing member access from column 132 to 100.

## Red evidence

Commit `51cde11a4bd5acd8c6593b9ee9d0eb4ee41f1c08`, run **44452561869**, failed on Ubuntu and Windows.

Ubuntu showed:

- native: `TypeError: Cannot read properties of null (reading 'missingField')` at `[eval]:1:132`;
- emitted: same TypeError message at `[eval]:1:100`;
- the native diagnostic printed `distinctivelyLongPrivateField`;
- the emitted diagnostic printed the hashed private field `_p800e419cfc`.

So returned values and the TypeError message itself can match while the process-visible source diagnostic still differs.

## Repair

The source-observer pass now classifies a non-optional `MemberExpression` as a guaranteed nullish failure when its receiver is statically:

- the literal `null`; or
- a unary `void` expression, which evaluates to `undefined`.

It reuses the same bounded local-catch ancestry proof as explicit `throw`:

- a containing `try` block with a local `catch` contains the failure;
- a function boundary reached before a catch means the failure may escape that function;
- reaching the program without a catch means the host may observe it.

Optional member access is excluded because `null?.x` does not throw.

## Yield control

A positive regression places `void (null).missingField` inside a local `try`/`catch` while retaining a separate private property. The emitted program remains behaviorally equal and the private property is still renamed.

## Green evidence

Repair commits:

- `d6198e93c60f75a27c03f9e39a7c8c475e5acdf3`: guard escaping statically nullish member failures.
- `7affda66d6f68a13e563ddc4d5798cbd65cd0990`: positive caught-nullish yield control.

Run **44452729643** passed the complete targeted implicit-source workflow on Ubuntu and Windows, including both JSDoc checks.

## Architectural boundary

This is intentionally a guaranteed-failure proof, not a complete treatment of host-visible runtime exceptions. An ordinary access such as `input.member` may fail when `input` is nullish at runtime even when static analysis cannot prove that input. Calls, getters, proxies, operators and many host APIs can also throw. Exact parity for default uncaught diagnostics therefore remains a broader compatibility boundary requiring either stronger may-throw reasoning, a defined exclusion from the semantic contract, or a different source-layout/runtime architecture.
