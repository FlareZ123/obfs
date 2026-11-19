# Author-style Int32 permutation adaptation: exact inverse and runtime frontier

**Agent 5, 18 November 2026. Status: intermediate negative candidate evaluation.**

## Scope

This experiment is a **local 32-bit JavaScript adaptation** inspired by the public mixed Boolean-arithmetic permutation ingredients investigated elsewhere in the repository. It is not a claim about the paper authors' 64-bit construction and it does not replace the primary-artifact audits in `im-results/mba-permutation-*.md`.

The narrow question was whether replacing BigInt with native JavaScript Int32 operations could rescue the runtime budget while retaining enough structural complexity to make inversion difficult.

## Freeze order and reproducibility

The attacker/inverse was committed first at:

- `502d8cf096d360664e19159faa154d23f7d10d8f`
- `sims/mba-author-int32-component-inverse.js`

Only after that freeze was the held-out generator/profile committed. The final high-precision profile source is:

- `1847fcb8fb582c704c84ee7a2bf8300263cf9cd3`
- `sims/mba-author-int32-heldout.js`
- held-out seed: `heldout-after-502d8cf:2026-11-18:agent5:mba-author-int32:v1`
- GitHub Actions run: https://github.com/FlareZ123/obfs/actions/runs/44421792552

The held-out generator creates 32 deterministic cases after the attacker freeze. It varies polynomial degree 1..3, one or two logical-right XOR-shift terms, three or five XORed rotations, and chain depths 1, 2, 4, 8, 16, or 32.

The polynomial coefficient parity is constrained so the triangular low-bit inverse is well-defined. The cyclic-XOR layer is inverted as a public 32x32 GF(2) linear map. The xorshift layer is inverted high bit to low bit. The attack receives the public round parameters and target.

## Exact recovery result

Run 44421792552 passed on both `ubuntu-latest` and `windows-latest`.

For each OS:

- 32/32 held-out inputs were recovered exactly.
- all generated protected predicates matched the native `code === 47` control over all 128 tested byte values.
- repository JSDoc gates `npm run typecheck` and `npm run typecheck:external` passed.

Representative deepest cases at depth 32 were inverted in milliseconds or less on the CI runners. This is a direct public-parameter inverse, so chain depth increases work roughly linearly rather than creating a search problem.

## High-precision CPU frontier

The benchmark compares a tight native equality predicate against the optimized Int32 permutation predicate. It alternates arm order over nine trials per depth and reports process user+system CPU per call.

An earlier run, 44421567412, used shorter samples and exposed coarse Windows CPU-tick quantization, including a zero-time sample. That run is retained as diagnostic evidence. The table below uses the longer-sample rerun 44421792552.

| Rounds | Ubuntu ratio of medians | Ubuntu strict >2.5 pairs | Windows ratio of medians | Windows strict >2.5 pairs |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.25107x | 0/9 | 1.27971x | 0/9 |
| 2 | 1.80067x | 0/9 | 1.85558x | 0/9 |
| 4 | 2.33737x | 0/9 | 2.22420x | 0/9 |
| 8 | 4.38241x | 9/9 | 4.28571x | 9/9 |
| 16 | 8.42685x | 9/9 | 8.00731x | 9/9 |
| 32 | 18.34435x | 9/9 | 17.09324x | 9/9 |
| 48 | 28.21227x | 9/9 | 25.77697x | 9/9 |

At four rounds the largest retained pair in run 44421792552 was 2.34689x on Ubuntu and 2.43945x on Windows. A later independent source-matched rerun by Agent 6, Actions 44424177927, observed two of nine Windows four-round pairs above 2.5x with a 2.83537x maximum. Ubuntu remained below the threshold in that rerun. Preserve this as a runner-noise/reproducibility conflict: the later strict breaches veto four rounds for that sampled workload under the project's current decision rule. At eight rounds the conclusion is stable across runs: every retained pair exceeds the 2.5x ceiling on both runners.

This is a hot microbenchmark for one predicate. It is not a universal bound and does not establish full-application admission. The strict project rule still requires source-coincident workload measurements before any supported deployment claim. Near-threshold passing samples must not be treated as robust admission when an independent same-source reproduction contains strict breaches.

## Security-performance decision

The adaptation exposes a poor tradeoff for the tested family.

One and two rounds fit every retained strict pair in the cited cross-platform runs while the pre-frozen public inverse recovers fresh hidden inputs exactly. Four rounds are near the boundary and have an independent Windows strict-breach reproduction, so they are vetoed for that sampled workload. Increasing depth to eight or more makes the tested predicate decisively over budget on both CI operating systems while the inverse remains direct and compositional.

Therefore this adaptation supplies no evidence of a useful security-performance frontier for COO/SNO static protection. More depth increases runtime cost without changing the fundamental attacker problem from public component inversion.

This result should remain in `im-results/`. It should not be promoted to `results/` or adopted as a backend. A future arithmetic candidate needs a structural reason why its public semantics resist deterministic composition or hybrid static/dynamic recovery, plus the same strict runtime checks.
