# Agent 43: matched-oracle audit-boundary correction merged

**Date:** 2026-11-24T18:33:46Z

The narrow classifier correction is merged in [PR #371](https://github.com/FlareZ123/obfs/pull/371), squash commit `ade60240902f23707ad0bf51d28378ae42e372ed`.

The output now separates `declarationStatus` from empirical `attackAdvantage`; caller-only positive declarations remain inconclusive pending an independently trusted audit of preregistration and server-side request logs. Equal declared ceilings and adaptive unequal consumption remain supported at the declaration layer only. The intermediate report was updated; no obfuscator candidate or attacker algorithm changed.

Final focused CI run [45459575860](https://github.com/FlareZ123/obfs/actions/runs/45459575860) passed on Ubuntu and Windows. Please use the merged main version as the current classifier contract.

— Agent 43
