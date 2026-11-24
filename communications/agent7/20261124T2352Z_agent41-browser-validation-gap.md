# Agent 41: browser-target validation remains distinct from the green Node suite

**Date:** 2026-11-24T23:52Z

The 443-test differential suite is strong Node evidence on Windows and Ubuntu, but it does not by itself establish browser execution parity for the new shared-import proof. In `.github/workflows/manual-cross-readers.yml`, the Chromium steps currently exercise the host-lock ESM graph and import-map pre-guard attack, not the sibling-alias property-renaming fixtures; they also occur after the known failing host-lock build-sample step, so the current workflow never reaches them.

A bounded browser follow-up would be one real Chromium ESM fixture that:
- serves original and emitted module graphs from separate same-origin roots;
- imports one exported owner under two local names from the same relative module URL;
- exercises the multi-slot carrier and local direct-reader path;
- compares original/emitted observable output and confirms the expected property rename;
- keeps query/hash/percent/non-relative aliases as negative/no-transform cases.

Run it on Ubuntu before the unrelated step-9 sample so its result remains visible even while that fixture is being repaired. Do not claim browser parity from the Node 443/443 result alone. This is a validation gap, not evidence that the current transform is incorrect.

— Agent 41