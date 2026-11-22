# Source-exact preservation of PR #151's 2026 MBA permutation artifact audit

**22 November 2026. Agent 25. Revalidated intermediate research archive.**

[Draft PR #151](https://github.com/FlareZ123/obfs/pull/151) contained a valuable 18 November negative-control audit of an independently published 64-bit MBA-permutation implementation and its code-generation, SMT-rotation, held-out inversion and CPU behavior. Nine report/resource/simulation paths remained absent from main. They are now preserved with their **original Git blob content** and are independently runnable; no current obfuscation backend or published security claim changes.

## Original files now on main

| Research artifact | Original and current Git blob |
| --- | --- |
| [Primary implementation provenance](../resources/2026-mba-permutation-primary-artifact.md) | `adf004f43b805ed3efc468329e8980513faabfeb` |
| [Empirical audit and limitations](mba-permutation-primary-artifact-audit-2026-11-18.md) | `34cdcdf1de6723e17764de4aa5757e46dab99a5f` |
| [CoreUtils path normalization check](../sims/mba-author-coreutils-static-recovery.js) | `5d40a024c3ee4d68ea97d974218b46d440875cd1` |
| [Arithmetic-shift rotation collision check](../sims/mba-author-smt-rotate-collision.js) | `0cd791629e02116bf204b4e3dc68c1b890c6cc01` |
| [Unsigned 64-bit forward/inverse primitives](../sims/mba-permutation-component-inverse.js) | `e9f7fbd84a62bd53a68b5ff958ce8c7d59e52db3` |
| [Held-out direct inverse verification](../sims/mba-permutation-heldout-inverse.js) | `eb2ee44ec9c7f7d5bd450fc5566d087ea40c877c` |
| [Paired JavaScript work and slash budget](../sims/mba-permutation-js-budget.js) | `0b19e254e5669ac0f33ad6e3472ff66c3ad30919` |
| [Minified public-source inverse, post-freeze held-out](../sims/mba-permutation-minified-heldout-recovery.js) | `d14e43a8934d380a643921c9b9f3835a6a2c4646` |
| [Minified public-source parameter recovery](../sims/mba-permutation-minified-static-recovery.js) | `9f32c483c6e494f9413f3748196493997b9bb83e` |

Each main copy was reread and its Git blob compared against the historical draft bytes. The standalone simulations use declared project dependencies and ordinary Node builtins. The author-artifact resource summarizes a particular upstream revision and cautions that paper-level comparisons require independent provenance reconciliation.

The original PR also changes the attack workflow and JSDoc configuration. We deliberately avoided importing its stale workflow into the newer shared suite. Instead, the two previously missing strict external JSDoc entries (`sims/mba-permutation-component-inverse.js` and `sims/mba-permutation-heldout-inverse.js`) were appended to the existing main configuration at `301fc97951bd8efabf5405320f9b521e5e20927e`. Its resulting blob `b5505c3e735662cbfcdad1622e5c8d1cf23e654e` is identical to the final isolated CI branch's configuration.

## Source-pinned cross-platform replay

The nine original files were copied unchanged into `agent25/pr151-mba-artifact-replay-20261122`, derived from current main. The existing `manual-attacker-normalizer.yml` workflow was scoped **only within that isolated branch** to six original scripts and two full JSDoc commands.

- [Initial Ubuntu/Windows replay 44982290296](https://github.com/FlareZ123/obfs/actions/runs/44982290296) passed at exact `e21f397b5329328cc121fb8927ee58a740d699e2`. At that point, the current main JSDoc manifest did not yet include the two new inverse scripts.
- [Final Ubuntu/Windows replay 44982369078](https://github.com/FlareZ123/obfs/actions/runs/44982369078) passed at exact `8ce75799c9278a9a27e8018fd907e94551f21f24`, explicitly including **both inverse scripts** in `npm run typecheck:external`. Executed commands were the CoreUtils recovery witness, SMT rotate collision, frozen held-out inverse, minified static recovery, held-out minified recovery, 2.5× budget diagnostic, and strict external and compiler JSDoc.
- The final main `jsconfig.external.json` blob equals the final isolated test branch. The copied scripts retain the exact original bytes.

Passing these tests demonstrates **reproduction of the original source-aware and constrained-public-source attacks** against this frozen synthetic/modelled implementation and both Node runner environments. It does not imply the same algorithm recovers arbitrary obfuscated code, defeats a secret trusted-server primitive, or invalidates the expanded 2026 paper's uninspected implementation. A reported arithmetic-shift collision is a reproducible weakness of the particular emitted transform; do not claim it applies to every unsigned rotation or optimized backend.

The workload-profile script is a diagnostic whose results depend on hardware, Node version and warmup. It should not be treated as a universal violation or certification of the project's 2.5× protected-work requirement.

## Research state

This work belongs in `im-results/` because the original audit states substantial uncertainty about exact paper-to-implementation mapping and the relevance of the synthetic generator. Historical frozen attack CI and original draft commits remain available through PR #151; the main archive now preserves all independently executable constituent evidence so a stale draft can be safely closed without losing it.

The repository's three-mode strong-obfuscation release remains **RELEASE-BLOCKED**.
