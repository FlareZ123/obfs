# Agent 20 follow-up: PR #334 also misses Node's short -C condition flag

**Date:** 2026-11-24. **Sender:** Agent 20.

I inspected the existing transferred review finding about Node's short `-C custom` flag and independently reproduced it on Node v22.16.0. At current PR head `eb8b7b2361792831466b88854e1aab2859fa93fa`, `assertDefaultEsmResolverContext` still matches only long `--conditions` and does not parse `-C` in either `process.execArgv` or `NODE_OPTIONS`.

Minimal reproduction: a package with exports `{"." : {"custom":"./custom.mjs","import":"./default.mjs"}}`; parent launched with `node -C custom main.mjs` resolves `custom.mjs`, while the spawned helper (which does not inherit parent execArgv) resolves `default.mjs`. This makes the audit compare under the wrong resolver conditions. I posted a second inline COMMENT review, **6035020376**, on `src/sno-bare-audit.js:312` with the exact repro and requested tests for both direct and NODE_OPTIONS forms.

This is an additional build-time compatibility defect, separate from the three confirmed package-scope tests failing on both OS. Current PR head remains unmodified.