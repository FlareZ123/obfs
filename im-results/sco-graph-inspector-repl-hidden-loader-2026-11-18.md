# Closed SCO graph admission: hidden execution through Node Inspector and REPL

**Date:** 2026-11-18 UTC  
**Owner:** Agent 18 (normal research)  
**Scope:** Node.js 22 native ESM execution and compile-time `partitionScoAsyncGraph` admission. This is an intermediate counterexample and bounded fail-closed correction.

## Why this matters

The SCO multi-module source admission scanner checks literal imports and refuses the known dynamic evaluation intrinsics `eval`, `Function`, direct `process.getBuiltinModule` references, and selected Node loader builtins. However, both `node:inspector` and `node:repl` can evaluate arbitrary JavaScript strings while remaining ordinary, syntactically valid static imports. Their evaluator strings need not contain AST-visible import expressions.

The real native Node ESM counterexamples in `test/sco-graph-private-path-policy.test.js` load an unlisted `hidden.cjs` with `module.exports={secret:137}`, even though the graph inventory includes only a visible `inspector.mjs` or `repl.mjs`:
- **Inspector:** `inspector.Session` connects and posts `Runtime.evaluate`; its `expression` string calls `process.getBuiltinModule("module").createRequire(import.meta.url)("./hidden.cjs").secret`. The evaluator returns the hidden 137.
- **REPL:** `repl.start` creates a default `REPLServer` evaluator using explicit in-memory input/output streams; a direct `shell.eval` uses the same string-based CommonJS loader, returning 137.

Both original modules run as actual Node ESM files in temporary directories created and torn down within the test. There is no original file corresponding to `hidden.cjs` in the compiler input graph. The dynamic loader expression is inside a runtime string, so the existing direct evaluator checks never observe a forbidden AST member.

The Node.js 22 documentation describes both capable APIs:
- [Node Inspector `Session.post('Runtime.evaluate')`](https://nodejs.org/download/release/v22.23.3/docs/api/inspector.html)
- [Node REPL default evaluator](https://nodejs.org/download/release/v22.23.3/docs/api/repl.html)

## Cross-platform red and green evidence

1. **Inspector red:** [workflow 44282611302](https://github.com/FlareZ123/obfs/actions/runs/44282611302) at [commit 100ca4a](https://github.com/FlareZ123/obfs/commit/100ca4afb0d34f783ad4678ac07abd8c91ad0db6) failed the new test on Ubuntu and Windows with `Missing expected exception.`. Native inspector evaluation had succeeded and returned 137 before the compiler mistakenly accepted the graph.
2. **Inspector green:** [workflow 44282776534](https://github.com/FlareZ123/obfs/actions/runs/44282776534) at [commit 62bd730](https://github.com/FlareZ123/obfs/commit/62bd7303f89052c55224cf6773f5d3734c7f5d13) passed on both OSes after adding `node:inspector` and `node:inspector/promises` to the forbidden runtime-loader import set.
3. **REPL red:** [workflow 44282923916](https://github.com/FlareZ123/obfs/actions/runs/44282923916) at [commit fdd0fd2](https://github.com/FlareZ123/obfs/commit/fdd0fd2fd12b3dfa7a85340d7435bf2142df00a6) failed only the new REPL refusal regression on both OSes; the native REPL had already successfully loaded the unlisted module.
4. **Both green:** [workflow 44283082106](https://github.com/FlareZ123/obfs/actions/runs/44283082106) at exact [commit 297f07f](https://github.com/FlareZ123/obfs/commit/297f07f39c8fa0b991b760d62ca89790c603a284) passed generated graph checks, **21/21 tests per OS**, and strict graph JSDoc. The final `dynamicLoaderBuiltins` includes `node:inspector`, `node:inspector/promises`, and `node:repl` in addition to the previous entries.

## Interpretation and remaining uncertainty

The change refuses two demonstrated alternate executable-code capabilities at compile time. It protects against an integrator mistakenly treating a syntactically complete graph manifest as sufficient to audit all server executable dependencies, while preserving the ordinary ESM graph syntax accepted by the compiler.

It is a deliberately limited whitelist/denylist repair, with no complete runtime import-closure proof. Other derived constructors, external host capabilities, package resolution escape hatches, and Node APIs could still evaluate code or load modules outside the supplied manifest. Server compromise, a trusted integrator intentionally bypassing the helper, and authorized client relays remain outside this guarantee.

The new guard acts at trusted-server compilation and adds no code to the served client or per-request server RPC. The local and CI tests do not prove a universal 2.5× bound or protect the server against a filesystem owner.
