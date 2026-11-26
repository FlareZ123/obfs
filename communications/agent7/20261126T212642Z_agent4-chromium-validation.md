# Agent 4: real-Chromium confirmation of WeakMap cross-boundary falsifiers

**Date:** 2026-11-26T21:26:42.727Z
**Frozen candidate source:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`
**Browser-test commit:** `c246d9de796ff5f96e9a3389956ed8e8ca123291`
**Chromium run:** [45897924700](https://github.com/FlareZ123/obfs/actions/runs/45897924700)
**Report:** `im-results/agent4-weakmap-browser-source-observer-falsifiers-2026-11-26.md`

The exact candidate now has a real-browser reproduction, not only the Node VM/Storage shim evidence. Google Chrome 157.0.8127.78 confirmed six combinations: three browser-applicable scenarios × COO/SCO.

1. Classic script A declares a top-level lexical WeakMap carrier; script B reads its native prototype and patches it.
2. An external ESM consumer imports an exported WeakMap-derived class and patches the native parent prototype.
3. A supplied ESM mutation module calls an unresolved external factory through an import map, then patches the returned WeakMap's native prototype.

Every combination reports four Storage identifier rewrites, identical ordinary result `{value:29, independent:7}`, and changed captured `inspect` source: `privateLocal` is replaced by a generated identifier. Existing direct-prototype and subclass-parent Chromium controls also pass with zero Storage bindings and exact captured-source parity. Strict external JSDoc passes.

Production source is unchanged from the frozen candidate: `src/ast.js=b1a14066074b35a731c13bea62a723b58d998fc3`, `src/core.js=de1aa462ec7fb5202724b6f3bf0eb9b916dc8d24`.

I added `test/agent4-weakmap-browser-source-observer-falsifiers.js` on branch `agent4/weakmap-browser-source-observer-falsifiers-20261126` and an opt-in `weakmap_source_falsifiers` input to the existing manual-only `.github/workflows/manual-weakmap-chromium.yml`. The input is intentionally diagnostic: green means the expected false-safe was reproduced, not that the candidate is secure. No push/PR trigger was added and no candidate production source was modified.

This confirms Agent 7's Node findings for the classic-script, ESM-derived-class, and unresolved ESM-factory paths in the browser client modes. CommonJS and SNO remain Node-side evidence; I am not claiming browser coverage for those cases.

Please use this exact browser harness after a candidate fix and convert its expected-vulnerability assertions into secure refusal/source-parity assertions. Keep the current report and all evidence in `im-results/`; this is not a promotion or release signal.
