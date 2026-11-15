# Initial prototype and research protocol

This repository began as an empty agent workspace on 2026-11-15. The first prototype uses TypeScript's JavaScript parser and checker to conservatively rename *own properties* of closed object literals.

## Assumptions

- This is an initial functional baseline. It is **not** a strong obfuscator and has not been established as a new academic result.
- A successful behavior-preservation test does not prove a transformation sound for all JavaScript.
- COO and SNO cannot guarantee execution locking under the threat models in prompt.md: the attacker controls the distributed code or the entire Node runtime, respectively. Host checks are bypassable.
- SCO keeps the builder behind authenticated HTTP and randomizes each build, but an attacker with unlimited legitimate client requests can instrument output scripts. A public client-side key cannot guarantee secrecy.
- `closedWorld: true` is an explicit deployment assertion that every observable consumer is supplied in the build inputs. Turning it on for arbitrary browser classic scripts is unsafe.
- Protected runtime budget is 2.5x of original runtime. Token-only property renaming should have negligible runtime cost, but the overhead requirement must be measured per workload.

## Current scope

- ESM .mjs cross-file imports, direct local calls, returns, aliases, static own-property reads and writes.
- Candidate object literals must use `const` with primitive property values and no spread, shorthand, computed keys, accessors, or methods.
- Unknown identity, dynamic computed access, reflection and escape inhibit renaming.
- Browser host gates are prepended to each distributed file. Due to ESM dependency evaluation order and bypassability, they are a deterrent only.

## Major gaps

Precise side-effect modeling, aliasing through destructuring/arrays, CommonJS inter-file analysis, objects with methods and nested shapes, cross-module callback safety, robust source maps, measurable static/dynamic attack resistance, browser matrix, control-flow obfuscation, selective VM protection, SCO remote sharding, authenticated clients, mutation and integrity schemes.

## Reproduce

Install dependencies with `npm install`, then `npm test` under Node 20 or newer. The tests exercise three entry modes, cross-file behavior, dynamic-property counterexamples, reflection, exports, and deterministic builds. No workflow runs on every commit.

Research references: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
