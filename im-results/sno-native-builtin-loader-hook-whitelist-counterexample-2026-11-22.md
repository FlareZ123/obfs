# Why a Node builtin-import whitelist cannot replace loader provenance

**Agent 27, 22 November 2026. Classification: intermediate adversarial source-contract counterexample, retained safe regression, and rejected yield-optimization candidate.**

## Motivating precision loss

The default SNO ESM path of [merged PR #277](https://github.com/FlareZ123/obfs/pull/277) refuses group-wide eager string decoding when static `import` resolves outside the exact supplied relative JavaScript graph. The parser treats bare native Node imports like `node:path` or `os` as unproved. In a trusted bare Node 22 process, merely reading `path.sep` or `os.arch()` does not modify the global `String.fromCharCode` intrinsic and does not read distributed source. On these limited graphs the refusal reduces literal obfuscation yield.

The actual two-OS baseline [run 45016594296](https://github.com/FlareZ123/obfs/actions/runs/45016594296), source `4758bfeaacd27a0778ac667cc10fef640235fcc0`, failed *only the positive-yield assertions* for SNO `node:path` and bare `os` imports. Native and emitted Node process outputs remained equal. The default had `metrics.literals=0` in the target file.

## Candidate, normal-host positive, and hostile-hook falsification

A research-only `src/core.js` candidate [`ca8ace2bb0849ea9fa01b3956c7311ec16516043`](https://github.com/FlareZ123/obfs/commit/ca8ace2bb0849ea9fa01b3956c7311ec16516043) changed `hasUnprovedModuleImport` to accept exactly `node:path`, `path`, `node:os`, and `os` in SNO mode, leaving COO and source-reader native imports (`node:fs`, `node:vm`) conservatively refused. The positive case actually encoded a target string and retained native process parity on Ubuntu and Windows [CI 45016700957](https://github.com/FlareZ123/obfs/actions/runs/45016700957). That is a narrow **trusted-native-host** benefit, not a full hostile-runtime proof.

Node 22.15+ provides synchronous user-defined ESM loader hooks. They can redirect an ordinary builtin specifier before an application module loads. Official reference: [Node `module.registerHooks()`](https://nodejs.org/download/release/v22.23.0/docs/api/module.html#moduleregisterhooksoptions) and [custom resolution semantics](https://nodejs.org/api/module.html#customization-hooks).

The second experiment runs the identical native and obfuscated ESM groups under an **external, uncompiled** `--import hook.mjs` preloader. The preload calls `registerHooks({resolve})`, which maps `node:path` to a `data:text/javascript,` module containing `String.fromCharCode=()=>'?'` and a compatible default export `{sep:'/' }`. The supplied `entry.mjs` imports `node:path` before dynamically loading `target.mjs`; target natively exports `protected-literal-value`. Same side effect, same host, same path resolution for both runs.

Under the candidate whitelist in SNO mode:

- The emitted target has **at least one genuinely encoded string**, while the original target retains its JavaScript literal.
- The original process returns `protected-literal-value`.
- The transformed process returns `???????????????????????` when the loader hook patched the realm before its eager decoder runs.

The experiment script `test/decoder-sno-builtin-loader-hook-attack.test.js` is retained on candidate branch `agent27/sno-esm-native-builtin-yield-20261122` at source `9f4066e8a2e0e98b8012aeb6d9429a99a5f430ae`; the proof-only assertions expected this specific divergence. [Ubuntu + Windows CI 45016931954](https://github.com/FlareZ123/obfs/actions/runs/45016931954) **passed**. A preceding experimental run [45016794481](https://github.com/FlareZ123/obfs/actions/runs/45016794481) failed Windows test setup because `--import` was passed a drive-letter path instead of a portable `file:` URL; the final script uses `pathToFileURL()` and passes on both platforms. No conclusion relies on the failed Windows-path invocation.

## Production safety decision

**Reject the SNO builtin-import whitelist for the default compiler.** Node's runtime loader provenance is not established solely by a specifier returned from `module.isBuiltin()`; native resolution can be shadowed by host preload hooks. SNO's declared full-control attacker already controls the Node runtime and memory. A whitelist could be considered only under an explicit, independently enforced loader-contract assumption, with all available source-byte observers reviewed separately. The routine trusted-node performance/obfuscation-yield benefit is insufficient to override the actual hostile-host semantic counterexample.

The safe source-pinned test `test/decoder-sno-builtin-loader-hook-parity.test.js` was introduced at `b4e4927eb067e039e9da2abcebc180b7a2b8933c` and [passed focused Node 22 Ubuntu and Windows CI 45017073600](https://github.com/FlareZ123/obfs/actions/runs/45017073600), including JSDoc. It asserts `metrics.literals===0` and full native/emitted process parity under the external same-host loader for **both SNO and COO**. It is merged into `main` through [PR #278](https://github.com/FlareZ123/obfs/pull/278), commit `03a64c7e8473d7bfbd69320a2e89ec6bdcfb9ef2`, without changing production compiler transforms.

The related [real browser import-map counterexample](browser-host-importmap-decoder-assumption-2026-11-22.md) independently demonstrates the same missing host module-resolution proof for COO. All of this is **semantic correctness under explicit host assumptions** and does not establish dynamic-analysis resistance, authenticated execution outside a full-control attacker, or universal 2.5× performance. The primary release decision remains **BLOCKED**.
