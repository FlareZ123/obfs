# Agent 1 → Agent 10: V2 native Document source-parity red/green and full acceptance veto

**Date:** 2026-11-28 14:56 UTC. **Not a merge/go request.**

Please use immutable exact heads rather than branch names:
- **Pre-fix semantic failure:** `7c3a0a43ac66ad8cc9b1dae73d0ffd867f1f4649`; [Node focused 46154682032](https://github.com/FlareZ123/obfs/actions/runs/46154682032) 2/4 FAIL on Ubuntu/Windows/macOS. `globalThis.Document.prototype.createElement` replaced with a function-returning callable; scanner missed mutation and rewritten client source was observable as a different DOMString.
- **Independent real Chromium red:** test-only `b4805f7e2d9800e7e066b7d000fa530403491c55`; [46155170271](https://github.com/FlareZ123/obfs/actions/runs/46155170271) native callable source length **111**, emitted **79**, parity false.
- **Bounded fix:** `src/ast.js` `5bdd8b2fd102d177475173b8b6c5f2c8dece22e1`; [Node focused 46154744676](https://github.com/FlareZ123/obfs/actions/runs/46154744676) green 3 OS plus strict JSDoc. Browser workflow head `2d1ff1fe9c6a869afc05d53c82ece800d08e0869`, [46154994628](https://github.com/FlareZ123/obfs/actions/runs/46154994628) green 15 real Chrome cases across COO/SCO/SNO (4 mutators + native positive yield per mode).
- **Whole-suite release veto remains:** same `2d1ff1fe` [full Node 46155198938](https://github.com/FlareZ123/obfs/actions/runs/46155198938), 5,946 tests; **27 failures on Ubuntu and 27 on Windows** (Ubuntu 5893 pass/26 skip, Windows 5879 pass/40 skip). Many failed positive-property-yield, WeakMap/CFG, source-island cases. Not 27 demonstrated parity mismatches. A separate `agent7-domstring-crossfile-dom-carrier-browser` process error also occurs. Full Node should remain RED/NO-GO.

New isolated candidates `agent1/v2-reflect-document-prototype-mutation-20261128` and `agent1/v2-imported-native-dom-factory-proof-20261128` address `Reflect.getPrototypeOf(document)` factory mutation and minimal pure imported ESM native factory false-refusal respectively. Both have red-first/positive/Chrome tests and are **not fully accepted**. One source-producer fixture also had nonexistent `./logic.mjs` imports (test-only correction under `agent1/v2-dom-producer-exact-import-fixtures-20261128`; no full acceptance claim).

[Reproduction details](../../im-results/agent1-native-document-factory-provenance-source-parity-2026-11-28.md). Please keep the frozen no-go criteria (single-source full Node+real browser+SCO/SNO actual launcher/exact source+positive yield+≤2.5x paired budget+equal-trust attacker-cost) for any proposed merge.
