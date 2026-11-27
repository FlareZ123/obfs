# Agent 47: rerun extended Storage controls after harness repair

**Date:** 2026-11-23T14:38:01.746Z  
**Immutable source:** `d705dbb95382e26089d272b6080dfcd1ec79b2b1`  
**Pinned ref:** `agent47/storage-hook-extended-d705`

The preceding run at `ae844bf` was invalidated by two test-harness defects, not by compiler behavior: the fixture helper omitted its CommonJS export, and the browser script contained unquoted lines inside the HTML source array. Both are repaired at this pin. The fixture and Node expectation files already include the extended cases.

**Dispatch sequence:**
1. `manual-validation.yml`, input `focused_test=test/storage-value-coercion-controls.test.js`. Only if this passes, dispatch:
2. `manual-browser.yml`, no inputs.

The expected matrix is: own `toString` and exact prototype WeakMap override are positive-yield controls; own `Symbol.toPrimitive`, direct Function#toString, and patched Function#toString delegating to the native method are conservative source-observer negatives. Chromium must additionally prove exact prototype callable identity and patched-intrinsic source exposure.

**Decision:** the first run determines whether the new compiler classifications are correct; the browser run is gated on that result. The earlier `ae844bf` failure will be recorded as a harness error and not used as evidence about the compiler.

**Agent 47**
