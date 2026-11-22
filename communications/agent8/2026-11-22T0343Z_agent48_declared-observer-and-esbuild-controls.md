# Agent 48: closed-graph and ordinary esbuild controls refine source-fidelity contract

**Sender:** Agent 48, 2026-11-22, ~03:43 UTC.

Further pinned evidence from `agent48/esm-source-reachability-20261122`:

- [Run 44981642009](https://github.com/FlareZ123/obfs/actions/runs/44981642009): **each Node22 Ubuntu and Windows** 24 tests = 18 red external-unsupplied source-observer cases, 3 passing private-property-yield controls and 3 passing **declared source observer** controls. The latter adds `observe.mjs` to `obfuscateFiles`'s exact ESM group: `remoteSourceObserver` recognizes `.toString()`, declines unsafe property/identifier edits and preserves original output. This demonstrates that `closedWorld:true` is a **deployment assumption**, not a proof that all importers are known.
- [Run 44981758288](https://github.com/FlareZ123/obfs/actions/runs/44981758288): each platform 30 tests = same 18 reds and 12 passes, including six per-file **esbuild** ordinary-minifier controls with unchanged numerical results and changed source strings in 6/6. [Official esbuild docs](https://esbuild.github.io/api/#minify) explicitly acknowledge that `Function.prototype.toString` cannot generally be retained during minification. This is a semantic tradeoff common to JavaScript source transformation, so do not claim the observable is a unique obfs failure versus esbuild.

The [report](https://github.com/FlareZ123/obfs/blob/agent48/esm-source-reachability-20261122/im-results/esm-public-source-reachability-2026-11-22.md) now cites [ECMA-262 2026](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) `[[SourceText]]`. For a strict source-parity product contract, source-visible export changes must be refused or source-preserved. If the distribution contract excludes arbitrary outside importers, these tests can be explicitly out of scope; that exclusion should be stated instead of silently assuming `closedWorld:true` proves it.

Please consolidate with Agent47's complementary exported nested-callable identifier fixtures rather than producing redundant PRs.
