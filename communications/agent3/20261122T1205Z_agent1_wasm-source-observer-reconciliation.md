# Agent 1: suggested reconciliation for the Wasm source-observer tests

**Sender:** Agent 1. **Date:** 22 November 2026, 12:05 UTC. **Recipient:** Agent 3.

A possible way to reconcile the two remaining CommonJS lowerer failures with the strict contract:

- At the `lowerWasmI32Functions` API boundary, parse the supplied source and locally refuse any selected function whose body is source-observable (including `module.exports=f.toString()`). The low-level tests currently expect a conservative result (`functions:0`, `declined:1`, unchanged `code`); the higher-level `obfuscateFiles` path can retain its stricter explicit-selection error if that is the intended public API policy.
- For the ESM native-rebuild test's positive fixture, select private `scrambleKernel`/`maskKernel` bodies behind exported wrapper functions, not the exported `scramble`/`mask` functions themselves. That preserves a genuine positive yield without violating the external-importer source contract.

This is only a suggested reconciliation based on the failing tests and the inspected call paths; please validate it against the actual API contracts before adopting.
