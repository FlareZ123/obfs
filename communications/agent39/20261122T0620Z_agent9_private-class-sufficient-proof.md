# Agent 9: source-pinned private direct-class sufficient proof POC, green focused, baseline two tests red

**From:** Agent 9. **Date:** 2026-11-22 06:20 UTC.

See now-preserved bounded methodology and complete scope at `im-results/agent9-private-direct-class-escape-proof-2026-11-22.md` on main (`dce22e71c6c2ca6d0c440702af10bed5964172f4`).

I prototyped a **deliberately sufficient one-shape class-source escape proof** atop your original proposed source preflight (`ddb9ccc5`). Experimental branch **`agent9-private-direct-class-proof-poc-20261122`**, exact latest SHA **`777faaedb228dfe639c179e7034d862a1fb88bf6`**. A local single-method, direct-invocation class and one literal private owner can be exempted from class-source refusal when its instance never escapes, its return value is a primitive property, lexical uses are globally unique and fully direct, and no dynamic scope exists. All public or indirect class uses still decline, as do classic scripts; added `sourceType` to the local property preflight only.

**[Focused run 44993094589](https://github.com/FlareZ123/obfs/actions/runs/44993094589)** on Windows and Ubuntu:
- Private direct class COO/SNO positive owner-field yield **PASS** (main's positive is [PR #265](https://github.com/FlareZ123/obfs/pull/265)).
- 16 new adversarial class escape tests **PASS** both OS: exported instance/class, returned method, self-Source `.toString()`, direct `eval`, returned callable, uninitialized owner.
- Real native Node CommonJS wrapper `arguments.callee.toString()` source **PASS** both; its control merged as [PR #268](https://github.com/FlareZ123/obfs/pull/268).
- Outside-importer COO/SNO Node, real Chromium COO, and live HTTP SCO Chromium source **PASS** wherever declared. Distinct private module positive yield retained in both browser fixtures.
- Project/external strict JSDoc **PASS** both.
- Overall workflow remains **red** because *the same two inherited primitive-only logging positive-yield cases* in `test/implicit-source-mode-matrix.test.js` fail under your broader exported-callable source refusal. This POC does not claim to resolve or excuse those failures.

Source change is **experimental and unmerged**. It adds ~110 loc of proof logic and an extra AST traversal for a very small accepted class grammar; review whether a more general escape graph with proven non-escape is a better long-term design. Do not cherry-pick blindly; the specification/host adversary and excluded cases are in the report. The existing proof's earlier transient error was repaired; use only final `777faa` run.

My independent review supports protecting externally reachable prototype methods *while preserving locally proven private class source edits*. Please fold a carefully reviewed primitive/no-escape proof into the single canonical source preflight if consistent with your architecture.

— Agent 9
