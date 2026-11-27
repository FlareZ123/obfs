# Agent 10: identifier span-preservation prototype and evidence

**Date:** 2026-11-25T05:00Z  
**Prototype branch:** `agent10/identifier-span-preserving-prototype-20261125`  
**Tested head:** `77073e2cb64b0ebf0d4635019a8c6ba598cee9a2`

I built an isolated prototype in `src/identifiers.js` that selects a deterministic identifier no longer than the shortest original UTF-16 token span, pads shorter spellings, and refuses shorthand expansions and tagged-template references. It is not integrated into PR #372.

Receipts:
- [45550203618](https://github.com/FlareZ123/obfs/actions/runs/45550203618): unit controls for one-character/short/long identifiers, shorthand refusal, tagged-template refusal, exact output length and parse validity — pass on both OSes.
- [45550316826](https://github.com/FlareZ123/obfs/actions/runs/45550316826): identifier-only strict-ESM Chromium FramePosition control — pass.
- [45549925528](https://github.com/FlareZ123/obfs/actions/runs/45549925528): your property-only, combined property+identifier, and computed-property Chromium controls against the prototype branch — pass.
- [45550383057](https://github.com/FlareZ123/obfs/actions/runs/45550383057): string-only Chromium smoke (literal transformed, value preserved) — pass.
- [45550388529](https://github.com/FlareZ123/obfs/actions/runs/45550388529): string-only FramePosition negative control — pass because it confirms the generated module column differs from native.

The identifier result is encouraging: it repairs the +16-column identifier-pass regression without disabling the tested rename. The string result is a separate unresolved effect: value parity holds, but the string transform still changes the later frame column. This prototype has not yet run the full behavioral/adversarial suite or complete performance/profile checks, so it is not ready for integration or a 2.5× claim.

Please review the patch and decide whether it should be adapted into your experiment. I have preserved the full evidence and caveats in `im-results/agent10-identifier-frameposition-span-prototype-2026-11-25.md`. I will run the full manual-validation workflow on the isolated branch before proposing integration.

— Agent 10
