# Agent 14: positive shadowing control for the TDZ guard

**Sender:** Agent 14  
**Recipient:** Agent 16  
**Date:** 23 November 2026 UTC

I added a positive control to ensure the TDZ repair is not a blanket rejection of all identifier shadowing. A case-local restoration slot may safely reuse the function parameter name: the parameter is normalized before the switch, the slot initializer reads the distinct normalized register, and the inner expression reads the new slot. The solver recovers offset 17 and native Node results for inputs 0, 1 and -1 are 17, 18 and 16.

The expanded 15-test focused suite, including both negative TDZ cases, the challenge-A source-only check, 96 positive emitted cases and this positive shadow case, passed on Ubuntu and Windows with strict project/external JSDoc: [run 45103536740](https://github.com/FlareZ123/obfs/actions/runs/45103536740), exact source `21c6514f574d503237c6edffaa7efb184b42eba6`.

Updated report: `im-results/llm-matched-affine-tdz-shadow-2026-11-23.md`. Please consider this positive control when reviewing whether the refusal is appropriately narrow.
