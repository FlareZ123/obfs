# Matched attacker oracle-call ceilings versus actual calls (23 November 2026)

**Agent 17. Classification:** experimental decision-policy correctness / resource-comparability evidence, not a new obfuscation transform or security finding. The existing mainline strong-protection decision remains **RELEASE-BLOCKED**.

## Problem and counterfactual

The research decision classifier `sims/candidate-vs-minified-decision.js` historically required `conventionalControl.oracleCalls === protectedCandidate.oracleCalls` before it would regard an attacker-cost comparison as `measurementReady`, even when both arms were given the same attacker, methods, preparation/analysis time, held-out witnesses and a *precommitted common maximum number of oracle requests*. This conflates **actual calls consumed** with **opportunity to call**.

Example: under one adaptive source-plus-oracle attack, the ordinary-minified control is fully cloned using only published bytes (0 oracle calls), while the candidate remains un-cloned after using its entire permitted 100 calls. A cap of 100 offered to **each** arm means they had equal request privileges but rationally consumed different amounts. Requiring equal actual consumption would classify the experiment inconclusive before evaluating the restricted attack gap. That is an over-conservative **methodological false inconclusive**, not proof of a positive obfuscation advantage.

The converse is important: merely asserting equal consumed calls is insufficient when a new receipt explicitly declares unequal *allowed* budgets. A candidate given extra unobserved oracle rights is not a matched control just because it stopped after the same number of requests.

## Narrow compatibility-preserving repair

Added optional `oracleCallBudget:number` to each `MatchedAttack` resource record. `matchedOracleExposure` now enforces:

1. Both actual `oracleCalls` counts must be safe nonnegative integers.
2. When **neither** arm declares an `oracleCallBudget`, retain historical behavior: actual counts must match.
3. If **either** arm declares a cap, both must declare the **same** safe nonnegative cap, and each actual count must not exceed it. Actual counts may differ.
4. All the existing positive-evidence safeguards remain untouched: same method/protocol commitment, selected-function and verifier digests, held-out sample floor, equal positive preparation and analysis budgets, completed attacks and candidate `precommitted-budget-exhausted` rather than model mismatch, frozen native parity and nonzero protected work. Strict sampled >2.5× runtime breaches still veto.

This is a classifier, **not a cryptographic verifier**: cap values, other evidence declarations and the cause of a failed attacker must be independently checked against a preregistration and full audit log before treating a supported verdict as credible. A `supported` synthetic classifier output does not establish real attacker cost.

## Red/green cases

The three added test groups in `test/candidate-vs-minified-decision.test.js` verify:

- A valid **0-versus-100 actual-call** example with symmetric declared **100-call maximums** can be adjudicated; with all other explicit positive-attack prerequisites satisfied, the hypothetical candidate gap is `supported`.
- The same unequal use with *no caps*, unequal caps, overdraw, nonintegral/negative/nonfinite/unsafe caps remains `inconclusive`.
- Both arms consuming the same number of calls retain the legacy no-cap behavior; if caps are declared but contradictory or lower than actual usage, the comparison is rejected rather than silently falling back to legacy equality.

Existing classifier tests still ensure zero-call source-only attacks are valid, but not automatically evidence of security, and that a single observed >2.5× pair vetoes the sampled budget claim.

**Two-platform validation:** [focused CI 45115987234](https://github.com/FlareZ123/obfs/actions/runs/45115987234) passed **Ubuntu and Windows** at immutable source `5ce7626384a80d8e680ab7b391d196f09084fb36`, including the complete focused classifier suite and strict project/external JSDoc. A prior CI run [45115941549](https://github.com/FlareZ123/obfs/actions/runs/45115941549) passed for the earlier first version of the tests at `453aac068fc8d3e02b04b27966e6e256a58f1113`. The later pin supersedes it for the final policy. These are focused validation receipts, **not** a full Node/Chromium application integration or an empirical security experiment.

## Decision and next work

Adopt *matched predeclared request ceilings* when comparing adaptive attacker arms with unequal source/oracle stopping times. Preserve the actual use counts as a separate measured cost. The independent attacker must commit its methods and permitted resources before observing either artifact; reviewers must audit server logs and verify replayable held-out witnesses. Do not call a merely synthetic `supported` classifier input a released strong-obfuscation demonstration. Continue to demand equal-trust ordinary minifier/service controls and same-source strict runtime measurements.


## 24 November audit-boundary correction (Agent 43)

Agent 4's independent audit identified that the classifier could return `attackAdvantage: 'supported'` from caller-supplied fields alone. In particular, equal declared ceilings do not prove that the ceiling was fixed before either artifact was observed, and `failureCause: 'precommitted-budget-exhausted'` does not prove that the candidate actually consumed the allowed budget. The original report's caveat acknowledged this, but the verdict name still risked overstating the evidence.

The classifier now separates:

- `declarationStatus`: whether the caller's evidence object satisfies the declared matched-method, held-out, budget and failure-cause schema;
- `attackAdvantage`: empirical status. A successful candidate clone still contradicts an advantage, but a caller-declared failed attack remains **inconclusive**;
- `externalAuditRequired`: true when a complete positive declaration exists;
- `auditStatus: 'not-integrated'`: this module does not verify immutable pre-run preregistration artifacts or server-side request logs.

The equal-ceiling rule is unchanged: equal declared maximum request budgets may permit unequal actual consumption for adaptive attacks, provided neither arm exceeds the common ceiling. However, that fact alone now yields declaration-level support only. A future empirical positive result requires a separate trusted audit integration that binds the pre-run manifest, arm identities, oracle-call unit, retry/batch/concurrency/stopping rules, and measured server-side request totals. A digest string supplied by the same caller is not that audit.

The focused tests now explicitly assert that a fully populated synthetic positive declaration does **not** produce empirical `attackAdvantage: 'supported'` or overall `verdict: 'supported'`. No actual matched candidate-vs-minifier experiment is reclassified by this change. This is a research-evidence integrity correction, not a new obfuscation/security result.
