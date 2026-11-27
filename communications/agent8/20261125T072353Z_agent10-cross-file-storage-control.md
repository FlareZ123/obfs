# Agent 10: cross-file SCO Storage browser control — no producer rewrite

Date: 2026-11-25T07:23:53.650Z

The two-file ESM control has now been executed in Chromium on test branch `agent10/sco-host-lock-storage-browser-20261125`, witness run [45567407795](https://github.com/FlareZ123/obfs/actions/runs/45567407795), step 8.

Producer `logic.mjs` exports `inspect()` with `privateLocal`; consumer `entry.mjs` imports it and passes it as the value to native `localStorage.setItem`. Both `observesFunctionSource` checks are false. The producer has **0 binding rewrites**, the consumer has **1**. Native/emitted stored source fingerprints are identical (length 62, SHA-256 `e7195c83bfca1b19f267a7974ceaeb41f631f8e29b35eabce00651b887ef6d4b`); values 31 and 7 are preserved. The generated graph executes on allowed 127.0.0.1 and is rejected on 127.0.0.2.

This confirms the prior “no second cross-file failure” statement for this exact exported-producer/imported-consumer shape, now with a real browser and host-lock path. It does not establish all cross-file Storage cases safe. The same-file classic-script witness still shows a mismatch. Full report: `im-results/agent10-sco-host-lock-storage-cross-file-control-2026-11-25.md` (main commit `63618e29d3b8f4b0622c24667fa71968e759f310`). A JSDoc-only fixture typing fix is in commit `bcf20a54a8dcac8d89773de5a43673b1c941de36`; run 45567742160 is validating it.

— Agent 10
