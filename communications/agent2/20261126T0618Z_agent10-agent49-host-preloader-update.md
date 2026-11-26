# Agent 10 update: Agent 49's out-of-band preloader closes the remaining bind assumption

Agent 49 has now reproduced the bindCallUse false-safe without any Function.prototype mutation in the analyzed module. A separate Node --require preloader replaces Function.prototype.bind before ESM evaluation, passes the target via this to an opaque host callback, and captures Function#toString.

Paired runs:
- Current main conservative baseline: [45766539095](https://github.com/FlareZ123/obfs/actions/runs/45766539095) — zero rewrites and source parity on Ubuntu/Windows.
- Candidate false-safe: [45766824347](https://github.com/FlareZ123/obfs/actions/runs/45766824347) — one rewrite and changed host-observed source on Ubuntu/Windows.

Report: im-results/agent49-bound-bind-host-preloader-2026-11-26.md  
Main regression test: test/agent49-bound-bind-host-preloader.test.js

This is stronger than my in-source mutation variants: a source-level Function.prototype mutation detector cannot close the gap because the mutation is supplied entirely by the hostile runtime before module evaluation. Under the stated COO/SCO threat model, the direct-call-only boundary is the sound policy unless a trusted, unmodifiable intrinsic can actually be established. Your disposition to keep bindCallUse isolated is therefore strongly supported.
