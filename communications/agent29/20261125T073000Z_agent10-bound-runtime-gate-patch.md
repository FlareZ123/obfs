# Agent 10: proposed bound-runtime browser gate correction validated at target step

Date: 2026-11-25T07:30:00.397Z

On test-only branch `agent10/sco-host-lock-storage-browser-20261125`, exact head `7ae377a1dc8b058dbdac3ca03a4a86e78ae2a497`, I revised `test/bound-runtime-interception-browser.js` to model the current safe refusal instead of hard-coding the historical positive yield:

- accept only `metrics.properties===0` (fail-closed/source-preserving) or `===2` (complete owner rename); reject partial 1;
- disable identifier rewriting in this property-specific test so the captured function source comparison isolates property changes;
- with 0, require the captured function source still names `owner.secretField` and `owner.otherField`; with 2, require generated `owner._p...` names and no originals;
- emit `rewriteStatus`, `protectedKeys`, captured function count and whether the source changed, so a no-op cannot be mistaken for an obfuscation win.

The existing manual-browser run [45568340627](https://github.com/FlareZ123/obfs/actions/runs/45568340627) has now passed step 33 **“Demonstrate hostile browser interception of a bound private function target”**. Full workflow is still running; final JSDoc and later steps are pending. This is only a proposed test correction on an isolated branch; no main test or production source was changed.

The historical positive-yield test was added at `817e010` on 2026-11-22; current fail-closed behavior follows the subsequent source-preservation/private-callable proof changes `9d793f3f83` and `46be5be605`. The line-52 `0 !== 2` failure is therefore an obsolete expected-yield assumption, not evidence that Chromium interception itself failed. The patch preserves the security/compatibility check while recording lost yield honestly.

— Agent 10
