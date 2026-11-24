# Rank-21 triangular source: differential-flag, graph, and low-rank comparison

**Status:** reproducible intermediate result; branch-only research, not an established security result or production backend decision.

## Question

Does the existing sampled affine-differential-flag learner outperform the graph and low-rank inversion methods on the same 32-bit rank-21, degree-five triangular permutation under hidden two-sided affine wrappers?

This comparison reuses the exact source fixture, wrappers, and eight targets from the graph-versus-low-rank experiment. The learner is the existing `sims/affine-flag-oracle-attacker.js`; no new attack implementation was introduced.

## Source and threat model

The source fixture is generated with seed `0x5eed21`:

- 32-bit triangular permutation;
- 21 independent degree-five leading monomials;
- five additional lower-degree terms for each active output bit;
- verified displacement rank 21;
- two-sided invertible affine input/output wrappers, with fixed seeds and biases in the test;
- eight fixed target outputs per wrapper/sample batch.

The attacker sees only the wrapped function as a chosen-input oracle. The hidden preimages are retained by the test solely for exact verification.

The differential-flag method assumes the existence of a compatible affine flag, which this triangular source has. It does **not** require the degree-five promise used by the graph method or the rank-21 promise used by the low-rank method. Its sampled flag discovery remains heuristic; a calibrated flag is not a proof of global correctness.

## Differential-flag sweep

The test uses 16 deterministic sample seeds, two affine wrappers, eight targets per batch, and exact forward-oracle verification for every recovered preimage.

| Samples per stage | Batches | Targets | Verified | Fully verified batches | Cached oracle queries |
|---:|---:|---:|---:|---:|---:|
| 16 | 32 | 256 | 244/256 | 26/32 | 298,574 |
| 24 | 32 | 256 | 253/256 | 31/32 | 441,936 |
| 32 | 32 | 256 | 256/256 | 32/32 | 585,296 |

No batch returned `unsupported`. Every incorrect recovery at 16 and 24 samples was rejected by the exact forward check. The 32-sample result is 256/256 for this two-wrapper, 16-seed sweep.

A second robustness sweep uses eight distinct affine wrappers, the same 16 sample seeds, eight targets per batch, and sample sizes 32 and 48:

| Samples per stage | Batches | Targets | Verified | Fully verified batches | Cached oracle queries |
|---:|---:|---:|---:|---:|---:|
| 32 | 128 | 1,024 | 1,018/1,024 | 124/128 | 2,342,073 |
| 48 | 128 | 1,024 | 1,024/1,024 | 128/128 | 3,488,944 |

The 48-sample setting is the better tested operating point for this fixture: it verified all 1,024 targets over eight wrappers and 16 sample seeds. This is empirical evidence, not a universal sample-complexity guarantee. It should not be generalized to other source families without new validation. On the four batches matched to the current-main graph baseline (the first two wrappers and first two sample seeds), 48-sample differential learning used 109,002 cached queries versus 448,438 unique graph inputs, a 4.11× unique-query difference; versus Agent 37's stronger-budget branch graph baseline of 518,180 unique inputs, the difference is 4.75×.

The observed non-monotonicity across individual seeds is consistent with the learner's current selection rule: it chooses the first nullspace-basis vector with nonzero first derivative. Increasing the sample count changes the sampled annihilator space and its returned basis, so the chosen candidate can change. This is a plausible explanation, not a proved characterization of every failure.

## Matched graph comparison on current main

The first two sample seeds and two wrappers reproduce the four eight-target graph batches. The current-main graph implementation uses the earlier confidence-budget version; the exact query counts below are asserted by the focused test.

| Wrapper | Sample seed | Graph reported calls | Graph unique inputs | Differential-flag queries at 32 samples |
|---:|---|---:|---:|---:|
| 0 | `0x12345678` | 187,684 | 112,499 | included in 73,162 total |
| 0 | `0xdeadbeef` | 187,605 | 112,449 | included in 73,162 total |
| 1 | `0x12345678` | 187,781 | 111,723 | included in 73,162 total |
| 1 | `0xdeadbeef` | 187,790 | 111,767 | included in 73,162 total |
| **Total** | | **750,860** | **448,438** | **73,162** |

Across these four matched batches, the 32-sample differential learner used 73,162 cached queries versus 448,438 unique graph inputs, a 6.13× unique-query difference.

### Graph confidence-budget version sensitivity

The older rank-21 branch also contains Agent 37's later graph confidence-budget changes:

- `75a3fe38`: account for all rank restarts in the affine-graph confidence budget;
- `bb591a5b`: expose typed graph stage evidence for confidence regression.

That branch version gives 518,180 unique graph inputs / 876,799 reported calls on the same four batches. Against that more conservative rank-restart-budget version, the 73,162-query differential result is 7.08× lower by unique inputs.

These are different graph implementation versions, not conflicting measurements. The test on this branch is based on current main and asserts the current-main numbers. The stronger-budget branch values are retained as a sensitivity comparison; the lower current-main count must not be described as having equivalent confidence without reviewing the budget proof.

## Low-rank comparison

The low-rank experiment's four maximum-orbit unique-query lower bounds sum to 8,269,172. The 73,162 differential-flag queries on the same four batches are far lower, but the methods rely on different structural promises and this is not a like-for-like correctness guarantee:

- low-rank method: displacement-rank promise 21;
- graph method: Boolean degree bound 5 and explicit confidence budget;
- differential-flag method: compatible affine flag plus sampled discovery and exact per-target verification.

## Reproduction

- Branch: `agent2/rank21-differential-flag-comparison-20261124`
- Test: `test/agent2-rank21-differential-flag-comparison.test.js`
- Current branch head at validation: `7e74d1c063e402125b302475e44688d475cad1d5`
- Focused CI: `45352422403` — Ubuntu and Windows jobs passed, including strict project and external JSDoc.
- The earlier focused run `45352186521` passed the two-wrapper comparison after refreshing graph expectations to current main.
- An intermediate run `45350551352` failed because the test initially carried graph counts from the stronger-budget research branch; those expectations were corrected to the current-main graph implementation before the passing run.

The test contains the deterministic seeds, source generator, target set, query-count assertions, exact forward verification, and current-main graph baseline. The lower-rank helper was checked unchanged between the old research branch and current main.

## Interpretation and limits

1. On this rank-21 triangular source family, the sampled differential-flag learner is a substantially cheaper attack than either tested baseline when its learned flag verifies.
2. Exact per-target forward verification is mandatory. A `calibrated` learner result alone is insufficient; 16- and 24-sample runs produce false recoveries.
3. Forty-eight samples per stage achieved 1,024/1,024 verified targets over eight affine wrappers and 16 sample seeds, but no universal guarantee follows.
4. The comparison is source-family-specific. It does not establish that arbitrary high-rank permutations admit an affine flag, nor that the learner succeeds on non-compatible permutations.
5. This is an attacker-method result, not a production obfuscator feature. It does not change the repository's RELEASE-BLOCKED/NO-GO integration status.
6. A useful next research question is whether a fresh-sample candidate-validation rule or a better nullspace-candidate selection policy can reduce false recoveries at 16/24 samples without losing the query advantage. Do not add such a variant without independent review and a frozen test.
