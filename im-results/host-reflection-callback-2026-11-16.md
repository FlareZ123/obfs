# Host reflection callbacks breach a closed ESM own-key proof (16 November 2026)

**Status:** reproducible intermediate *negative* evidence. The behavior was verified on Node 22 (Ubuntu and Windows) at fixed commit [88580584](https://github.com/FlareZ123/obfs/commit/88580584d83320c987befe72ad21a7ea3cb619ed) by [the completed three-job gate 43837852222](https://github.com/FlareZ123/obfs/actions/runs/43837852222). It does not establish a new general obfuscation attack or native-runtime correctness defect. It establishes a precise limitation of the current host-intrinsic assumption.

## Experiment

Run `node sims/host-reflection-callback.js` on the corresponding branch/commit. The independent executable simulation constructs three closed ESM input modules, invokes the actual `obfuscateFiles({mode:'coo',closedWorld:true,properties:true,identifiers:false,strings:false,seed:'host-reflection-callback-20261116'})` compiler, and writes the source and emitted graph to separate temporary directories. It launches each graph under a fresh Node ESM process, with a `--require host.cjs` preloader **excluded from compiler inputs**.

The record module contains a top-level unescaped literal `schema={externalFormat:'audit-v1',auditCount:3}`. Its one-argument exported `inspectRecord(key)` uses `Reflect.ownKeys(schema)` and `Object.getOwnPropertyDescriptor(schema,'externalFormat')` before returning `value:schema[key]`. The caller passes the statically proved **own** field name `'auditCount'`. The separate state module exports `state={secretField:41}`.

The native/pre-obfuscated program and the compiled program both call the record reader and, only if the reader returns a function, use that result to dynamically import `state.mjs` through a constructed `Function`. The native/imported module field names are printed in JSON. No `Function` identifier or `import()` AST expression appears in the three compiler-input modules: the external preloader supplies a capability by mutating a formerly primitive own value.

Two host preload variants intercept **different** reflection calls. The first wraps `Reflect.ownKeys(schema)`. The second wraps `Object.getOwnPropertyDescriptor(schema,'externalFormat')`. Both mutate `schema.auditCount=Function` and forward to the saved original native method. The record return expression deliberately evaluates these calls **before** `schema[key]`; an initial draft erroneously put the descriptor call after the read, producing an invalid test failure. That failed first run was [43837469788](https://github.com/FlareZ123/obfs/actions/runs/43837469788); the revised source and all three jobs are green at the definitive pin.

## Exact output and scope

The compiler emitted **1** cross-file private-property rename, changing the state owner's `secretField` into `_p64625bc809b7` at the fixed seed. On **both** Node 22.23.4 Ubuntu and Windows jobs, the paired fresh-process results were:

| Host preloader | Native output | Compiled output | Equal? |
|---|---|---|---|
| clean (no mutation) | `[41,null]` | `[41,null]` | yes |
| patched `Reflect.ownKeys` | `[41,["secretField"]]` | `[41,["_p64625bc809b7"]]` | no |
| patched `Object.getOwnPropertyDescriptor` | `[41,["secretField"]]` | `[41,["_p64625bc809b7"]]` | no |

The script asserts the clean-host equality, the native hostile outputs, and both hostile differences whenever property renaming occurs. It also permits a **future compiler that conservatively refuses all renames** to pass while recording the actual yield. This prevents a later safety fix from being mistaken for a simulation failure. The old stock 20 property tests, strict JSDoc, frozen application/attacker checks, browser integration, and the legacy Node job passed in the same workflow, but their existing workloads are unrelated to this host callback distinction.

## Interpretation

The narrower current `safeClosedCallerRecordRead` own-property proof prevents an **inherited** `Function` constructor from reaching the caller via a missing own field. That condition is insufficient under a host that can replace an allowed reflective function **already handed a private record**. Such a callback can write a Function constructor into an otherwise proven literal **own** field immediately before the computed read. The constructed function then executes a runtime-only module import invisible to the source-only static module consumer graph.

The compiler's plain-realm result was behavior-preserving in this fixture, and the project has always acknowledged hostile intrinsic replacement as an unresolved assumption. This evidence quantifies that boundary against its current positive-yield implementation. It is **not** a native-realm mismatch, not a proof that the transformed output is cryptographically hidden, not a performance claim, and not a new confidentiality boundary in COO: the attacker can already obtain all publicly distributed files. For general hostile-runtime semantic preservation, a static analyzer must either justify assumptions about ambient callable intrinsics or conservatively refuse the relevant transformation. Even an original *null-prototype* record would not prevent direct mutation of an own field through a callback passed that object; the proposed null-prototype exception addresses inherited-property access only.

**Next checks:** cross-realm and browser host replacements; narrowed proof that rejects reentrant calls while accepting pure own-key reads; external loader hooks that alter module resolution; a positive protected-work yield ledger after any refusal; and public-only functional attack comparisons. Do not generalize these 2 + 1 fixtures to a universal compiler soundness claim.

## Real Chromium positive-yield corroboration

The separate `test/host-reflection-callback-browser.js` runs real headless Chrome under the built-in HTTP server and **two independent browser documents**: `/native/index.html` and `/compiled/index.html`. Each document serves its own three-file ESM graph and preloads either clean, `ownKeys`-patched, or descriptor-patched intrinsics *before* importing the entry. The injected constructor's exact constant-string `import('./state.mjs')` resolves relative to the current browser document into its respective graph. This arrangement has no runtime URL/string concatenation inside the compiler input that could trigger conservative Function-source-observation refusal.

At exact code SHA [8240896a](https://github.com/FlareZ123/obfs/commit/8240896a776f86265b746260cdeb61e9bba136f3), all three jobs of [application challenge 43841169105](https://github.com/FlareZ123/obfs/actions/runs/43841169105) passed (Ubuntu, Windows, and Node 22.0 legacy; Chromium ran on Ubuntu). The actual browser compiler renamed **1** private property, to `_p6f9ded04e13d` with the browser-specific seed:

| Browser page host | Original graph result | Compiled graph result | Match? |
|---|---|---|---|
| clean | `[41,null]` | `[41,null]` | yes |
| `Reflect.ownKeys` wrapper | `[41,["secretField"]]` | `[41,["_p6f9ded04e13d"]]` | no |
| descriptor wrapper | `[41,["secretField"]]` | `[41,["_p6f9ded04e13d"]]` | no |

An earlier browser test served both ESM graphs to a single page and concatenated an import source string using a dynamic `JSON.stringify(target)` expression. The compiler correctly refused Function-source-observable rewriting; `crossFile.properties=0` (green [43839643205](https://github.com/FlareZ123/obfs/actions/runs/43839643205), **refusal-only**). Adding a mandatory positive-yield assertion made [43840302894](https://github.com/FlareZ123/obfs/actions/runs/43840302894) and controlled diagnostic [43840741865](https://github.com/FlareZ123/obfs/actions/runs/43840741865) intentionally red. The diagnostic found `observesFunctionSource(entry.mjs)=true` on the dynamic string concatenation, while a simple ESM importer returned one private rename. The final independently hosted constant-string browser fixture restored the positive transform without weakening compiler safety checks and proved the hostile-runtime mismatch **on genuinely transformed JavaScript**. These early runs are retained for causal traceability. This is an intrinsics-tampering counterexample, not a reason to remove the source-observer veto.
