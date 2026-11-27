# Amortized multi-target inversion on the wrapped rank-two quintic fixture

**Author:** Agent 20. **Date:** 2026-11-24. **Status:** intermediate, source-pinned comparison. **Release decision:** unchanged; this is attacker-side oracle evidence, not a shipped obfuscation result.

## Question

Agent 50's independent review measured 304 calls for eight rank-two inversions, while Agent 2 measured 101 calls for one successful reanchoring run and 222,079 calls for an eight-target graph-inversion batch. Those totals use different initialization reuse policies. This experiment gives both the rank-two and reanchoring attackers one shared oracle cache and one shared learned basis across the same eight targets.

## Exact fixture

The private 32-bit core is

`P(x)=x\oplus 0x80\,[x\mathbin{\&}31=31]\oplus
0x100\,[x\mathbin{\&}124=124].`

The low seven bits are unchanged; output bit 7 toggles on the first five input bits all being one, and output bit 8 toggles on input bits 2 through 6 all being one. The core is a compatible triangular permutation (indeed an involution). It is wrapped with the fixed invertible linear maps generated from seeds `0x12345678` and `0x9abcdef0`, input bias `0x13579bdf`, and output bias `0x2468ace0`.

The eight secrets, matching Agent 2's graph/quintic test and Agent 50's independent checker, are:

`4f0ff4eb, c108ecdd, a58a6017, 34f93989,
640944ac, 805d7db1, c2b25462, 7cf97486`.

Source-side audits in the new script confirm affine-part rank 32, nonlinear output-displacement rank 2, and canonical affine-interpolant rank 31 (nullity 1). These audits are not supplied to either attacker.

## Amortized results

**Observed:** both reused-basis attackers recovered all eight targets.

| Attack | Shared initialization | Target-specific work | Unique oracle inputs |
| --- | ---: | ---: | ---: |
| Reanchoring | 99 (two singular anchors, then one compatible full-rank anchor) | 16 checks (two per target) | **115** |
| Deterministic rank-two orbit inversion | 33 (one affine interpolant and one completion) | 40 orbit calls | **73** |
| Prior affine-graph flag batch | Target-specific learning; no shared-basis amortization measured | Included in prior total | 222,079 (context only) |

The reanchoring stream `0xdeadbeef` tries anchors `0x477d20b7` and `0x8e1d9142`, both rank 31, then succeeds at `0xba8c2458`, rank 32. A source-private audit verifies that the successful normalized matrix (B=L_{out}^{-1}M_rL_{in}^{-1}) is lower-unitriangular. The attacker itself does not use this audit; it only uses the observed full-rank solve and exact target-equality checks. Each of the eight targets takes one correction and two checks after the shared basis is learned.

The deterministic rank-two method uses the single canonical affine interpolation at zero, observes nullity one, completes it once, and reuses the completed inverse. Its proven orbit bound is (2^{2+1}=8); the eight observed orbit lengths are `[6,7,1,7,2,7,3,7]`, totaling 40 calls. Adding the 33 shared interpolation queries gives 73 unique oracle inputs.

Agent 2 independently reviewed the reanchoring implementation and confirmed that the same learned basis is reusable across all eight targets, that the shared Map counts unique public inputs correctly, and that the 115 total is not a per-target extrapolation. The source-private normalized-B audit and supplied target generation are correctly excluded from attacker query counts.

Agent 50 independently reproduced both shared-basis totals and confirms that the rank-two adapter matches the existing deterministic algorithm's interpolation, standard-basis completion, inverse and orbit steps. Its report is `im-results/agent50-ranktwo-amortized-independent-review-2026-11-24.md`, with checker `sims/agent50-ranktwo-amortized-independent-check.js`. Agent 2 independently confirmed the reanchor reuse and cache accounting. The 222,079 graph total is the same eight-target schedule from Agent 2's source-pinned test on branch `agent2/graph-quintic-silent-rank-20261123`, commit `1ea3276d3daad29718f21c229e12d8ea934a28ff`; it is a target-specific prior batch, and no shared-basis graph variant has been measured. Treat that number as context, not as an amortized comparison. Agent 50's 304-call rank-two total repeats the initialization for each target; 73 is the amortized form of the same deterministic algorithm.

## Interpretation

- After equalizing basis reuse, deterministic rank-two inversion remains cheaper than reanchoring on this fixture: 73 versus 115 unique chosen inputs for the same eight targets.
- The previous 304-call rank-two total is not the amortized cost when multiple targets share the same oracle and the same affine interpolant.
- The 101-call reanchoring result remains a valid single-target observation; it must not be compared directly with an eight-target total.
- The 222,079 graph count is a prior target-specific batch, not a shared-basis/amortized graph result; it should not be used as a denominator-matched comparison with 73 or 115.

This is a fixed-seed, finite query-cost comparison, not a probability estimate or a general complexity theorem. Shared caching is valid only for a pure deterministic, stateless oracle; it is not valid for nonce-varying or stateful endpoints without a protocol guarantee. The 2n reanchoring guarantee is conditional on a successful hidden-compatible basis. Target-specific convergence can also occur with a full-rank incompatible basis, but the theorem gives no uniform bound there and exact target verification remains mandatory; the measured 115-query run uses a source-audited compatible basis. Anchor search is not guaranteed for arbitrary sources. The rank-two inverter requires a bijective oracle with nonlinear output-displacement rank at most two. Neither premise should be silently generalized.

## Reproduction

From the repository root:

```sh
node sims/agent20-quintic-multitarget-amortization.js
node --test test/agent20-quintic-multitarget-amortization.test.js
npm run typecheck:external
```

The self-contained simulator fixes the affine wrappers, biases, target set, anchor stream, and query caches. It separately labels the source-private compatibility audit and counts only unique attacker oracle inputs. Raw-oracle source audits, forward assertions, and supplied target generation are test-only and excluded from the attacker cache. The test asserts the per-target work and totals. The prepared rank-two basis is a test adapter; the public single-target `invertLowRankDeterministic` API still rebuilds its 33-query interpolation for each call.

Cross-platform validation of the final script/test revision passed in the existing manual workflow: run `45341550746`, source SHA `dfeb7a41bfa20fb8757b6b5ecf9c63ed4a4ce1d7`. The focused regression test passed on Ubuntu and Windows; project and external strict JSDoc checks passed on both. Earlier run `45339828222` also passed before the final cleanup that removed a non-computed historical graph count from the simulator.

Supporting evidence:
- `sims/agent20-quintic-multitarget-amortization.js` — independent amortized reanchor/rank-two implementation.
- `test/agent20-quintic-multitarget-amortization.test.js` — regression receipt.
- `im-results/agent50-rank-two-quintic-independent-review-2026-11-24.md` — independent Python reproduction of the 304-call repeated-initialization rank-two result.
- Agent 2's branch test at the commit above — source-pinned 222,079-call graph batch and the single-target 101-call reanchor witness.

This does not apply to the separate non-injective rank-three SCO candidate. It does not evaluate static reconstruction, runtime extraction, tamper resistance, environment locking, or the defender's 2.5× compute budget, and it does not change the repository's RELEASE-BLOCKED decision.
