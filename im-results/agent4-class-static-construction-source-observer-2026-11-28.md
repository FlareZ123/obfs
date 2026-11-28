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

## 28 November 2026 10:06Z: independent implicit-effect falsification and actual Chromium receipt

The 52-line explicit-call guard above is **not sufficient** against class static operations that invoke user-defined methods implicitly:

- [Run 46131483605](https://github.com/FlareZ123/obfs/actions/runs/46131483605), exact test-only `5a55cc9bf8a00d008f61d21988b0aa67fe9aa450`: real 3-file ESM/native source false-safes via inherited static **getter, destructuring getter, iterator and setter** on Ubuntu and macOS (Windows workflow also concluded failed). Each false-safe has 4 transformed Storage bindings in every COO/SCO/SNO core configuration, replacing native `privateLocal` with `_v...`.
- [Run 46131900630](https://github.com/FlareZ123/obfs/actions/runs/46131900630), exact test-only `de0a9462660c2bbef39c0ac5e32e4983bacb5df5`: **140 passed / 8 failed on Ubuntu, Windows, macOS**. Four new false-safes are inherited `super` getter, setter, computed getter and a named class-expression inner static getter. The four old inherited cases remain red.
- [Run 46132249192](https://github.com/FlareZ123/obfs/actions/runs/46132249192), source `501ee5a94762d0b519814a4856fbec69d6b24a6d` with a bounded static-inert grammar replacing effect-node blacklisting: **150/150 semantic cases passed on macOS**, but the overall job failed strict JSDoc with three implicit-`any` callback parameters. The source-pinned typed successor `7c7024e11c12a13c67d2c42839f93b10586d2d74` is under focused CI [46132929247](https://github.com/FlareZ123/obfs/actions/runs/46132929247). Do **not** count the previous job as an accepted green gate or assume the successor passed before its result.

A separate real-browser proof now exists: `test/agent4-class-static-chromium.js` and Node test wrapper on `agent4/class-static-real-chromium-20261128` at `79bc555af41c13b470906dbc91d99eb89b1c9eb7`, [focused Chromium run 46132973695](https://github.com/FlareZ123/obfs/actions/runs/46132973695) **Ubuntu success**, including strict JSDoc. Actual headless Chromium serves three ESM files over localhost HTTP, invokes real `Storage.setItem` and `document.title` DOMString conversion. It compares original and emitted complete JSON outputs for self-construction, inherited getter, `super` getter and implicit template coercion. All four source-exposing cases have **0** transformed private bindings after conservative refusal; independent genuinely nonobserved primitive static-field control still has **4** transformed bindings. This is browser parity, *not* a proof of advanced static-analysis resistance, runtime extraction mitigation or the 2.5× budget.

A **distinct** computed-property-key source defect was independently reproduced in [Windows job 140941302577 of run 46132746123](https://github.com/FlareZ123/obfs/actions/runs/46132746123), exact test-only `5b38ef2fc32d53606a8c66ca728f44f12c3943b6`: **152/156 pass**, four true false-safes for class computed method key, instance-field key, static-field key and object computed key. `ToPropertyKey` of an object invokes its `toString` hook, which can mutate `carrier.instance` to native `WeakMap` without a syntactically effectful property expression. Captured function source differs in all COO/SCO/SNO despite 4 binding rewrites. Two primitive computed-key positive-yield controls passed. A small primitive-only computed-key certificate guards this gap on branch `agent4/computed-key-topropertykey-guard-20261128` at `107bdf5c8cb0c9bd126bd1c6c55e2b4135990f50` with [focused run 46133324950](https://github.com/FlareZ123/obfs/actions/runs/46133324950) pending. Do not claim that patch accepted until its source-pin semantics + typecheck complete.

Next falsification surface: computed **member** reads/writes/optional references, `key in record` and `Reflect.get(record,key)` also execute ToPropertyKey of an unproved object key, and require ordered evaluation. Eight test cases, including two independent safe primitive positives, are preserved on test-only `agent4/member-key-on-topropertykey-guard-20261128` at `1fac8b71663d8e411ab764584f75583dcd4d3c41`. Its focused workflow is queued. Until observed, these are **hypotheses**, not demonstrated source defects.

Use the exact branch source SHA, real side-effectful original result, emitted source text and transformed binding count to tell a false-safe apart from an intentionally conservative zero-yield refusal. Do not combine core SCO mode with real `createScoHandler` HTTP distribution without testing its distinct per-request path. This is still intermediate research, not mainline acceptance.
