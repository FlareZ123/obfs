# Dense two-sided affine-compatible sources: source-known basis-screen falsification

**Agent:** 20. **Date:** 23 November 2026. **Status:** intermediate reproducible negative attack evidence. **Primary release:** RELEASE-BLOCKED.

## Question

The sharpened [conditional 2n=64 reanchoring theorem](reanchor-depth-tightness-2026-11-23.md) guarantees exact inversion when the source-private matrix `B=Lout^-1 M_r Lin^-1` is lower-unitriangular. Does attempting up to 16 publicly chosen anchors make that condition easy to meet for independently seeded, dense two-sided affine-wrapped compatible permutations?

The test uses three 32-bit source permutation families: seeded fully nonlinear triangular, Rivest degree-3, and Rivest degree-7. Each is wrapped between independently seeded invertible dense GF(2) maps with input/output affine shifts. For each family, **32 exact fixed source secrets and targets** are evaluated. The attacker sees only `F(x)` and its published target, starts at canonical anchor zero and adds up to 15 deterministic seeded anchors, and declares success only after an actual target equality check.

The **independent source-private evaluator** retains `Lin`, `P`, and `b` to reconstruct `B` for *each actual attempted anchor*. It explicitly distinguishes compatible full-rank bases, incompatible full-rank bases and singular bases. This hidden-state evaluator is excluded from the attack. A separate source-private clean four-shear fixture must classify as compatible; it is a positive control against an audit function that simply labels everything incompatible.

## Source-pinned results

The focused [Ubuntu/Windows run 45289330361](https://github.com/FlareZ123/obfs/actions/runs/45289330361) passed at immutable source `3bcad73458fe24eed58d227aa8a6be9f9d696e36`. A later annotation-only commit `735604074c97c8702ebbfa6f14401e305083b671` corrected the helper's external return shape to `fullRank:boolean`: it had previously returned numeric 31 for every singular matrix without actually computing exact singular rank. All classifications in the cited run used only `rank===32` versus singular and their counts remain valid. The audit never asserts exact singular rank.

| Family | Cases | Tried bases | Hidden-compatible | Fullrank incompatible | Singular | Exact targets |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dense nonlinear triangular | 32 | 512 | **0** | 153 | 359 | **0** |
| Rivest degree-3 | 32 | 512 | **0** | 164 | 348 | **0** |
| Rivest degree-7 | 32 | 512 | **0** | 125 | 387 | **0** |
| **Total** | **96** | **1,536** | **0** | **442** | **1,094** | **0** |

The public chosen-oracle inversion attempt spent 560–784 distinct queries on individual sources. Average queries per source were 681 (nonlinear triangular), 692 (Rivest 3), and 653 (Rivest 7), before exhausting the configured 16-base search. Neither rank deficiency nor accidental full rank alone established the hidden normalized compatibility premise. The fixed positive four-shear source *was* independently classified compatible.

The exact fixture code and target-generation policy live at `sims/reanchor-dense-compatibility-screen.js`. Its test, `test/reanchor-dense-compatibility-screen.test.js`, checks source population accounting, source-independent oracle success/failure, rank-classification partitions, configured query ceilings and the clean positive-control basis.

## Implication and caution

This is an empirical **failure of this particular black-box reanchoring search policy** on the selected dense seed population. It demonstrates why the mathematical upper bound cannot be promoted to a universal affine-wrapped compatible permutation attack. The 442 full-rank but hidden-incompatible bases are direct counterexamples to treating publicly visible matrix rank as proof of compatibility. Agent 2's independent finite width-four [incompatible fullrank cycling example](../communications/agent20/20261122T1201Z_agent2_fullrank-incompatible-cycle.md) provides a separate exact negative control.

Zero successful targets or compatible bases in a finite deterministic source sample is not a statistical upper bound on the success probability of independently random secrets or a hardness theorem. A source with different generators, anchor selection, target, or higher budget may behave differently. Stronger existing CEGAR, low-rank, interpolation or other adaptive attackers remain relevant; the matched higher-budget hybrid experiment is separately recorded rather than treating these failures as defender security.

The result is source-family selection evidence only. It does not establish static source concealment, dynamic instrumentation resistance, environmental locking, or the required 2.5x defender compute budget.
