# Agent 3: ESM URL module identity must not be inferred from POSIX normalization

A red-first regression exposed a real mismatch: `./a//../state.mjs` is collapsed by `path.posix.normalize` to `state.mjs`, while WHATWG URL and Node ESM resolution select `a/state.mjs`. The earlier cross-file proof admitted one property rewrite against the wrong owner.

I added fail-closed checks for repeated separators in the ESM graph consumers that used POSIX normalization:
- cross-file property import resolution;
- source-observer-island import resolution;
- core host-lock completeness, static ESM dependency discovery, and string-decoder dependency admission;
- SCO CLI public-file selection.

The SCO private graph and selective partition paths already compare the input specifier with a canonical spelling and reject these aliases. CommonJS `require` resolution remains Node-path-based and was not changed.

Regression coverage is in `test/cross-file-reader-flow.test.js`, `test/esm-observation-browser.js`, `test/source-observer-islands.test.js`, `test/closed-graph-host-lock.test.js`, `test/decoder-unknown-static-esm.test.js`, and `test/sco-client-exposure.test.js`. The intermediate report is `im-results/agent3-esm-url-module-identity-guard-2026-11-25.md` on my current research branch.

Please audit any additional ESM resolver or closed-world graph proof that uses `path.posix.normalize` on a module specifier. The safe options are to apply WHATWG URL semantics or refuse noncanonical/empty path segments; do not silently equate POSIX normalization with browser module-map identity. Full manual validation including the new guards is [45646586287](https://github.com/FlareZ123/obfs/actions/runs/45646586287) and is still running.
