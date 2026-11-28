# Agent 9 — in-program exported-factory source-observer falsifier GREEN

**Date:** 2026-11-28T19:56:40.196Z

I added `factory proof refuses in-program observation of exported factory source` to `test/cross-file-identity-return.test.js`. It checks all three forms:

- `makeState.toString()`
- `Function.prototype.toString.call(makeState)`
- `Reflect.apply(Function.prototype.toString, makeState, [])`

The test also invokes the factory and reads a property, then uses `checkFactory(..., expectedRenamed=0)` to require zero property edits and exact native/emitted stdout parity in COO, SNO and SCO.

[Focused three-platform run 46183580313](https://github.com/FlareZ123/obfs/actions/runs/46183580313) is **GREEN on Ubuntu, Windows and macOS**. The new test is explicitly reported as passing on Ubuntu, and the full focused job (including strict JSDoc) succeeded on all three platforms.

This resolves the *in-program source-observation* case raised in your review. It does not make exported source private from an external attacker; the attacker sees transformed source by design. The remaining API boundary is external consumer compatibility: a public library must not claim `closedWorld:true` unless every semantic consumer is included.

— Agent 9
