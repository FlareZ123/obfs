# False-positive matched-attacker decision from non-finite claimed verification counts

**Agent 7, 21 November 2026. Research-gate integrity regression.** Scope is the *in-process evidence classifier* `compareCandidateEvidence`; it authenticates none of the underlying source or verifier artifacts and does not confer obfuscator security.

A positive advantage classification requires a conventional minified-control clone, a candidate failure under the same precommitted protocol, a shared selected-function set, and the same held-out input set. [Prior decision-gate repair #220](https://github.com/FlareZ123/obfs/pull/220) required an explicit held-out count floor and permitted valid zero-query source-only attacks. Its evidence readiness still checked the *claimed count of completed held-out comparisons* through numeric `>=` and equality only.

Because `Infinity === Infinity` and `Infinity >= 12288` in JavaScript, **two `verifiedHeldoutComparisons:Infinity` declarations were treated as measured and could drive `attackAdvantage:'supported'` and overall `verdict:'supported'`** in the classifier's deliberately hypothetical matched-attacker positive fixture. Similarly, an unsafe integer claimed protected-function count was not rejected by the previous `Number.isInteger` guard. These declarations cannot represent an enumerable completed verification corpus. This is a false evidence-acceptance condition, even when the caller uses the output only as a research decision.

## Falsification and fix

An adversarial regression in `test/candidate-vs-minified-decision.test.js` assigns each held-out verification field matched values from `[-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]` and asserts the positive verdict stays inconclusive, with `measurementReady:false`. A separate test substitutes an unsafe protected-function count. The test uses the existing **hypothetical** committed positive fixture; its pass/fail says nothing about actual attacker ability.

- **Red source** `1ef54e368670231a6e8f59109a647385cb091882`, [CI 44949175150](https://github.com/FlareZ123/obfs/actions/runs/44949175150), captured `Infinity: true !== false` in the new test on Ubuntu. The comparator had accepted the non-finite count.
- **Green source** `ab7be5213588370e566e2876136257a2a2405f43`, [CI 44949225451](https://github.com/FlareZ123/obfs/actions/runs/44949225451), Ubuntu/Windows Node 22, full four-way source-only/math+host trace, real Chromium, strict JSDoc.

The fix uses `Number.isSafeInteger(evidence.protectedFunctions)` and `Number.isSafeInteger(control.verifiedHeldoutComparisons)` before declaring a matched measurement. Both attacker arms must still report exactly equal verification counts and meet the previously declared floor. This rejects invalid counts without changing valid zero-query source-only negative evidence or the production four-way attack classifier.

## Boundary

Input checks cannot authenticate claimed hashes, work budgets, verifier-case provenance, or actual attack independence. A malicious evidence submitter can still invent valid-looking safe integers and digest strings. Source-pinned raw verifier artifacts and independent review remain mandatory; the previous negative candidate conclusion and strong-project **RELEASE-BLOCKED** decision are unchanged. This report is an intermediate methodology repair, not an academic obfuscation breakthrough.
