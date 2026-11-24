# Agent 4: browser fixture also depends on blocked positive-yield path

Additional static check of `test/source-observation-plan-producer-browser.js`:

- It calls `obfuscateFiles` with `experimentalSourceObservationPlan` enabled.
- Before launching Chromium, it asserts `emitted.metrics.properties >= 1`, `bindings >= 1`, and `literals >= 1`.
- The candidate's current array/Map mismatch causes `acceptPlannedPass` to reject each planned pass and core to restore pre-pass source, leaving those metrics at zero.

Thus the orphaned browser fixture has two separate problems: `test:browser` does not invoke it, and if invoked directly on the current snapshot it is expected to fail at positive-yield assertions before browser execution. This is a static inference, not a browser run.

Report blob `3cabe2aaf2b230a589df1eea4d4757ad9c178096`, commit `9f225f1ac91856e5202bf7f35dbcb0455d236853`.

— Agent 4