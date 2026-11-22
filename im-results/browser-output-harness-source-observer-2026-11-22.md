# Separate native output marshaling from source under obfuscation

**Agent:** 2. **Date:** 22 November 2026. **Status:** Browser-harness corrective regression and explicit native source-observation counterexample under review. **Classification:** Intermediate test-methodology evidence. Production source changes: zero.

## Root cause

The project conservatively protects source bytes when a native coercer may read a function as a string. Native btoa converts its argument to a string, and a function argument therefore exposes Function.prototype.toString bytes in a Base64 payload. The global JSON.stringify method is writable and may be replaced with a function returning a callable. Consequently the syntactic composition btoa(JSON.stringify(...)) is potentially a function-source observer and must not be classified unconditionally primitive.

Two real-Chromium test fixtures had embedded that same expression inside submitted app source solely to marshal a result back to the external test. The newly corrected compiler classified it as source-observing, causing previous positive-yield assertions to fail despite intact native/emitted value parity. This conflated test transport with protected application code.

## Evidence and correction

- [Combined source-locked Node 22 gate 45021998382](https://github.com/FlareZ123/obfs/actions/runs/45021998382), exact compiler SHA b7677ab80d0a3f1aba66cb7af9d27cabaaa05023, passed on Ubuntu and Windows, including prescribed Chromium integration.
- [Expanded browser RED 45022003318](https://github.com/FlareZ123/obfs/actions/runs/45022003318) at same immutable SHA, failed the inert clone fixture's private-property positive-yield check at clone-source-browser.js:79. The previous source-observing clone and message-port negatives passed.
- [Expanded browser partial recovery 45022291468](https://github.com/FlareZ123/obfs/actions/runs/45022291468), exact fixture-only SHA f6db58daf498b2c4c2f61bb8fa5cea14d279e4d1: all three clone cases passed real Chromium parity, including one safe private-property rename in the inert-record control. The workflow reached a second harness issue in decoder-dynamic-data-esm-browser.js.
- [Expanded browser second attempt 45022545127](https://github.com/FlareZ123/obfs/actions/runs/45022545127), exact fixture-only SHA eb689c3410607cd5d87a7eb20d104396fd6a4402: the ESM source now published its result but its page-load handler could fire before top-level await completed, so the harness encoded undefined. This is a test timing bug independent of compiler correctness.
- Corrected subsequent ESM fixture uses an explicit ready event dispatched after dynamic import completion. The untransformed HTML harness listens and performs Base64 output serialization only after the value exists. The clone fixture uses the standard page-load handler because its compiled module has no top-level await. Source code remains available in test/clone-source-browser.js and test/decoder-dynamic-data-esm-browser.js.

## Independent native proof and positive control

The added Node test test/btoa-mutable-json-result.test.js checks that replacing JSON.stringify with a function returning a named local function does not let the compiler change the Base64-visible function source. A second fixture calls btoa with a literal primitive input and separately exports a safe private literal, requiring real string-transformation yield. The [two-platform Node 22 regression 45022465411](https://github.com/FlareZ123/obfs/actions/runs/45022465411) passed all six cases with strict JSDoc. This test is a guard against treating mutable native-call results as statically primitive.

## Final expanded Chromium validation

[Full real-Chromium browser workflow 45022761186](https://github.com/FlareZ123/obfs/actions/runs/45022761186) **passed** with exact tested executable source 01a5020e4be4aca6f2fcde872b23f752a73019db, including every scripted browser scenario, source-observation/refusal controls, external dynamic-data import poisoning, the now-positive local relative import, native/emitted parity, real TLS and SRI, browser type checks, and Chromium integration. The final source under test contains both harness changes and the new Node mutable-JSON regression. Later branch edits only add this report. This validates the test methodology fix while the compiler remains exactly unchanged.

## Exact merged-source replay

[Full expanded Chromium browser gate 45023142902](https://github.com/FlareZ123/obfs/actions/runs/45023142902) also **passed** on the immutable merged-main source 5c7330d564f10349af3d02dee862b05d1b736c3b. This replay proves the harness adaptation still works after integration with all intervening main-branch source changes. The independent combined Ubuntu/Windows full Node gate [45023137522](https://github.com/FlareZ123/obfs/actions/runs/45023137522) also **passed** at the identical source pin `5c7330d564f10349af3d02dee862b05d1b736c3b`, covering the complete behavioral/adversarial suite, strict JSDoc and the prescribed integrated Chromium checks. These two separately completed workflows validate the test changes together with the merged compiler at one immutable source. The smaller [combined full Node 45021998382](https://github.com/FlareZ123/obfs/actions/runs/45021998382) previously passed at a compiler-equivalent source before the test-only harness patch.

## Interpretation

Native source-observation soundness should be evaluated on submitted app code, while serialization and test reporting should live outside it. The corrected harness does not change the app's original semantic computation, runtime obfuscation algorithms, or the strict 2.5x performance requirement. Browser-specific validation passed at the fixed source pin above; future source changes still require independent replay. The core strong-security release status remains RELEASE-BLOCKED.
