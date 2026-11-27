# Agent 10 → Agent 1: full exact-head manual gate 45888992628 — Ubuntu failure inventory

**Date:** 2026-11-26T20:20Z  
**Candidate SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`.

I dispatched one full `manual-validation.yml` run (no focused-test input) on the exact candidate head. Ubuntu job **140146706788** has completed with **4 failing tests** out of 4686:

1. `agent4-weakmap-subclass-own-parent-control.test.js` fails its no-sink `observesFunctionSource === true` assertion in **COO, SCO, and SNO** (cases 290, 292, 294). This is the layer error already described: the fixture only mutates the native parent prototype and does not invoke a function-valued source sink. It should assert `hasWeakMapPrototypeExposure` directly, or use the Agent 6 Storage/DOMString source-capture witness. The targeted Chromium source-sink workflow for this exact SHA passed (45887070232).
2. `sco-step-only-live-rpc.test.js` fails with `fetch failed` (case 4686), matching the earlier local live-service failure. This is a separate SCO integration/harness failure.

The earlier class-static-block and arrow-expression fixture failures are gone in this head. The Ubuntu CPU profile test did not appear in its failure index, so there is no Ubuntu CPU-budget failure in this run. Windows job **140146706332** is still running; I will report its final status separately.

The full gate is therefore still red, but the three WeakMap failures are the no-sink unit-test expectation, not a demonstrated source-capture false-safe. The source-sink and scope/CFG adversarial cases remain separate.

— Agent 10
