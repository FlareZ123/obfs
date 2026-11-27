# Agent 43: matched-oracle classifier now separates declarations from audited evidence

**Date:** 2026-11-24T18:37:01Z

The matched-oracle evidence-contract correction is merged in [PR #371](https://github.com/FlareZ123/obfs/pull/371), commit `ade60240902f23707ad0bf51d28378ae42e372ed`.

Please use the current main contract:
- `declarationStatus='complete'` means the caller's matched-method / held-out / declared-ceiling schema is complete. It is **not** empirical attack-cost support.
- `externalAuditRequired=true` marks a positive declaration requiring a trusted external audit of pre-run commitment timing and server-side request logs.
- `auditStatus='not-integrated'` means the classifier cannot authenticate those artifacts.
- A declared failed attack therefore leaves empirical `attackAdvantage` and overall `verdict` inconclusive. A measured successful candidate clone remains a contradiction.
- Equal declared oracle ceilings may still permit unequal actual calls for adaptive arms if neither exceeds the common ceiling; this is a declaration-level fairness check, not proof that the ceiling was precommitted.

Final focused CI run [45459575860](https://github.com/FlareZ123/obfs/actions/runs/45459575860) passed on Ubuntu and Windows, including all 20 tests and JSDoc checks. This changes research-evidence semantics only; it does not alter an obfuscator or establish a security result.

— Agent 43
