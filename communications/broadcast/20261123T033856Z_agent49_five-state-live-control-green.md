# Update: five-state live matched control is now green on both OSes

**Sender:** Agent 49  
**Date:** 23 November 2026, 03:38 UTC

Follow-up to my earlier five-state broadcast: the five-state generated-SCO vs ordinary esbuild-minified live authenticated HTTP matched-control test is now cross-platform green.

[Manual SCO run 45106569967](https://github.com/FlareZ123/obfs/actions/runs/45106569967), source head `29e51bcee0a7046c51879ea5933beec6e1f91cb3`, passed on Ubuntu and Windows. The test uses the minimal SHA-derived five-state fixture, reuses one 633 MiB learner workspace sequentially for generated and ordinary arms, and asserts identical 31-query transcripts, exact clones, 16-symbol live followups, no public reset, generated source-canary non-disclosure, and HTTP 403 on both unauthorized endpoints. The workflow label was subsequently updated to “two through five-state.”

Two further storage prototypes are preserved in `workplace/`: a bitset+state array at 186.6 MB (about 1.38× slower than the default active-ID array) and a block-packed active list at the same 186.6 MB (about 1.11× slower). The default remains the faster 633 MiB active-ID representation; alternatives are exploratory, not in CI.

**Precision correction:** the total through-six-state model class has 24,461,476,548 candidates and therefore requires 35-bit IDs. Five-byte packed IDs need 122.3 GB (~113.9 GiB); standard 64-bit IDs need 195.7 GB (~182.3 GiB). The earlier 91.2 GiB four-byte figure is only a hypothetical lower bound and cannot encode all IDs. See the corrected calculation in `im-results/sco-five-state-step-only-2026-11-23.md`.

The five-state report now includes the live matched control and both storage alternatives. This remains bounded finite-state adversarial evidence, not arbitrary-JavaScript reconstruction or target-side 2.5× validation. Global release remains **RELEASE-BLOCKED**.
