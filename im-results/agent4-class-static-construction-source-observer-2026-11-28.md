# Class static initialization can construct a class before instance-field effects are recorded

**Agent 4, 28 November 2026. Intermediate compiler-compatibility evidence; not a security claim or mainline release result.**

## Precise failure

On the integrated but non-main carrier-analysis donor `agent47/merged-source-transfer-104case-20261127`, `src/ast.js::hasWeakMapPrototypeExposure` traverses class-expression static blocks **before** recording effectful instance-field initializers. But JavaScript class static blocks execute at class definition time and can construct the class before the enclosing `const Holder=class ...` declarator has completed. A static block `new this()`, a local alias of `this`, or a registry-contained class expression can therefore run `x=(carrier.instance=new WeakMap())` before the scanner knows to replay that initializer. The later `Object.getPrototypeOf(carrier.instance)` resolves to native `WeakMap.prototype`, which can be replaced with a source-observing `set` method.

The existing three-file ESM parity harness intercepts `WeakMap.prototype.set`, passes a private `inspect` function to it through a mocked Storage method, and records `document.title=String(inspect)`. Numeric outputs remain correct in both originals and transformed programs, but **captured callable source bytes differ**, because the compiler changes `privateLocal` to `_v...`.

This is a semantic mismatch for the provided program/host pair, distinct from a hostile client reading or relaying public artifacts.

## Exact red and bounded green

| Evidence | Exact source SHA | Node matrix | Outcome |
| --- | --- | --- | --- |
| Original donor + three source-parity falsifiers | `bce18e13c08b72bf26b44a6a6e69e0e8f2db20ae` | Ubuntu, Windows, macOS Node 22.23.4; three-file ESM; COO/SCO/SNO core API | [Run 46130981945](https://github.com/FlareZ123/obfs/actions/runs/46130981945): **129 passed / 3 failed on each OS**. Each failing fixture rewrites four Storage bindings in each mode and changes native captured `inspect` source. |
| Add six differential/precision cases and guarded compiler amendment | `03d4e8f2b08ed86ffdeaff6d7aa46891a0e1e7d2` | Same three OS; 138-fixture focused matrix and strict JSDoc | [Run 46131183663](https://github.com/FlareZ123/obfs/actions/runs/46131183663): all matrix cases and focused JSDoc passed on each OS. The original three falsifiers now refuse unsafe renaming; previous ordinary-field control cases remain in suite. |

**Implementation:** `src/ast.js` on `agent4/class-static-block-construct-proof-20261128` uses a conservative static-class-work check for explicit calls, construction, tagged calls and possible class escapes, intersected with effectful deferred instance-field initializers. Both class expressions and declarations are screened. The patch does not claim a general effect lattice, complete alias proof, or monotonic correctness for arbitrary JS.

**Reproduce focused pair:** `npm ci --ignore-scripts --no-audit --no-fund && node --test test/agent3-weakmap-cfg-matrix.test.js` at each exact source SHA; workflow `.github/workflows/manual-validation.yml` accepts `focused_test=test/agent3-weakmap-cfg-matrix.test.js`.

## Out-of-proof edges still under challenge

A class can be constructed **implicitly** by a static operation invoking an inherited static getter/setter, `Symbol.toPrimitive` hook, or iterator. The initial 52-line guard may miss such effects, and a second six-case source-pinned test-only child `agent4/class-static-implicit-effects-20261128` at `5a55cc9bf8a00d008f61d21988b0aa67fe9aa450` probes those execution routes plus an independently safe static-local positive. Its focused workflow was dispatched; results must be checked before expanding the green claim or merging. A safe next implementation must prove that static work cannot implicitly execute instance fields, or refuse source-sensitive changes when proof fails.

## Separation of claims

These cases show a **compiler semantic-compatibility** gap and its first bounded guard. They do not measure static reconstruction resistance, dynamic extraction, authorization, unauthorized modification or sustained workload cost. No user-facing protection improvement is established, no source from this branch was integrated into main, and the repository-wide strong-protection verdict remains **RELEASE-BLOCKED**. One focused matrix is not the full source-pinned Linux/Windows/Chromium/SCO/SNO deployment and paired 2.5× acceptance corpus.
