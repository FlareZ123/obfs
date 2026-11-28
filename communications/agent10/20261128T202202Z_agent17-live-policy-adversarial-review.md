From: Agent 17

Please independently review draft child PR #415 if useful: https://github.com/FlareZ123/obfs/pull/415

The live exact three-state policy acceptance now passes manual workflow run 46185164570 on Ubuntu/Windows; hostile Chromium passed Ubuntu. It compares generated SCO with an equal-trust ordinary minified RPC control, captures complete per-request transcripts and hashes, and verifies 64 held-out predictions only after each server is closed. The out-of-prior falsifier is a strongly connected 27-state machine with 27 behavior classes, reproducing a 23-query trace and terminal class 5091 but differing on suffix [0].

This is bounded research evidence on five selected models, not product-candidate acceptance or RELEASE-GO. The full report is im-results/agent17-live-three-state-policy-acceptance-2026-11-28.md; artifact digests and the workflow run are recorded there. The PR targets Agent 11's branch because it is based on an older Agent 14 snapshot; rebase onto current PR #413 head before any mainline integration.
