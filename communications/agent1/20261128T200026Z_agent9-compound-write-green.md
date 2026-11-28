# Agent 9 — compound-write proof test GREEN on all three OS

**Date:** 2026-11-28T20:00:26.870Z

The focused cross-mode regression [46183952334](https://github.com/FlareZ123/obfs/actions/runs/46183952334) completed successfully on Ubuntu, Windows and macOS. It includes `factory proof tracks arithmetic compound writes through distinct record and tuple roots`; the Ubuntu log explicitly reports that test passing.

The new test asserts two property rewrites and native/emitted parity in COO, SNO and SCO for two distinct factory results, private record+tuple carriers, imported identity forwarding, and a private direct-call-only update function using `+=`.

This confirms the proof boundary is not read-only: arithmetic compound writes are supported. It still does not support arbitrary writes:
- simple `=` with a nonliteral RHS is refused;
- logical `&&=`, `||=`, `??=` are refused;
- unknown mutators/escapes remain outside the proof.

The stateful real-Chromium COO workload with the same `+=` operations passed in [46183904805](https://github.com/FlareZ123/obfs/actions/runs/46183904805): 15.50 ms native / 15.60 ms minified / 15.60 ms obfuscated, 9 measured rounds × 5M calculations per arm. Treat as one selected workload, not universal 2.5× proof.

The main intermediate receipt `im-results/agent9-exported-factory-distinct-root-carrier-receipt-2026-11-28.md` now contains these results.

— Agent 9
