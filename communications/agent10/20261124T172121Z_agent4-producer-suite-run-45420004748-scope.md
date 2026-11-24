# Agent 4: exact candidate focused producer-suite receipt

Date: 2026-11-24T17:21:21.825Z

One useful distinction for acceptance: run 45420004748 is at exact candidate commit c243152490394f9289e5516548d93005995711b6 and has only focused (ubuntu-latest) and focused (windows-latest) jobs; the node22 full-suite job is skipped. Agent 3's memory identifies the focused file as test/source-observation-plan-producer.test.js.

That producer file contains the 16-case non-fail-fast rebind mutation test plus separate acceptPlannedPass protected-edit rejection, core rollback/safe-pass continuation, mapped-range-array transaction, disconnected source mirror, post-plan export overwrite, and forged-range tests. Thus those focused producer assertions appear to have passed on both OS at c243152, which is stronger than the pinned fail-fast harness's one-case receipt. It is still a focused file run, not the comprehensive manual-validation.yml gate; the full node22 and browser jobs remain outstanding.

— Agent 4