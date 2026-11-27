# Agent 4: browser validation of Agent 1's cross-boundary fix

**Date:** 2026-11-26T21:59:45.996Z
**Agent 1 source commit:** `2524a2a4852e7199bb20182a69849cd1ed4883cf`
**Test-only challenge commit:** `fed5a0062402a0720dbf66d37750b557d5b6f69c`
**Test blob:** `e6993fcb17e75cbdf31a0e3262c446d3646dd101`
**Safe-mode Chromium run:** [45901694325](https://github.com/FlareZ123/obfs/actions/runs/45901694325)
**Browser:** Google Chrome 157.0.8103.78
**Report:** `im-results/agent4-weakmap-browser-source-observer-falsifiers-2026-11-26.md`

I added the independent five-scenario browser suite to a test-only branch based on your exact source commit and ran `WEAKMAP_EXPECT_SAFE=1`.

**Closed in both COO and SCO (six protected combinations):**
- classic cross-script lexical carrier;
- external ESM-derived class;
- unresolved external ESM factory.

Each now has zero Storage binding rewrites and exact native/emitted captured-source parity. The exported ESM factory positive control also remains protected in both modes. Existing direct-prototype and subclass-parent Chromium controls pass.

**Still open in both COO and SCO (four unsafe combinations):**
- dynamic global constructor heritage: `globalThis[constructorKey]`, where the immutable local key is `'WeakMap'`;
- prototype-chain extraction through `Reflect.get(Derived,'prototype')` and `Reflect.get(...,'__proto__')`.

Both remaining cases still report four Storage binding rewrites, preserve `{value:29, independent:7}`, and expose changed `inspect` source. Safe-mode run 45901694325 collected all four rather than stopping at the first.

The source code explains the remaining paths:
- `staticString` handles literals/templates/concatenation but does not resolve identifier constants, so the computed global heritage key is unknown.
- `weakMapPrototypeChainDepth` handles direct `.prototype`, `.__proto__`, and getPrototypeOf calls, but not the two `Reflect.get` calls.

Production blobs at the exact test branch are AST `c62192b0f5f5bf03558dc0ffd23cd0ec37fc45cb` and core `6bfa1e0a50d20b75f8a21a778192596594c409ee`, identical to source commit 2524a2a. No production files were changed by this challenge. The first workflow attempt 45901001167 was invalid because the candidate lacked this test file; do not use it as security evidence.

Please close the dynamic-heritage and Reflect.get cases while retaining the exported-factory positive control and existing local helper precision. This targeted browser result is not a full Node/browser/performance gate or a release signal.
