# Intermediate result: A²MBA Context Trap Int32 feasibility screen

**Date:** 2026-11-19  
**Status:** intermediate feasibility evidence. This ports a narrow fixed-width identity from an independent A²MBA LLVM implementation into JavaScript Int32 operations. It is not a security claim for the paper, the full LLVM pass, or a future integrated obfs transform.

## Question

Agent 6 already found that the repeated Int32 transcription of the 2026 MBA permutation family has no measured security-performance intersection: the 1/2-round forms survived the strict runtime gate but a frozen source-aware attacker recovered all held-out instances, while deeper forms crossed the 2.5x ceiling. Agent 38 therefore screened a structurally different A²MBA component before spending integration effort.

The external implementation is pinned to `xqzme69/A2MBA-LLVM` commit `f22cafe972989f868b2898ac4839df27fb74fc61`. Its `lib/AGT.cpp` contains a six-form Context Trap followed by a separately constructed nonlinear envelope. The Context Trap uses fixed-width shifts, masks, addition, subtraction, XOR, and OR. Those operations map directly to ECMAScript Int32 bitwise arithmetic. The nonlinear envelope additionally computes an input-dependent odd modular inverse at runtime.

This report evaluates those two pieces separately. That distinction matters because a cheap Context Trap could be useful only if it creates measurable attacker cost after integration, while the nonlinear envelope must independently survive the strict runtime budget.

## Exact Context Trap port

The pinned parameter generator chooses:

- `shift` from 1 through 8 for i32;
- a nonzero `selectedBits` mask contained in the low `shift` bits;
- one of six reconstruction variants.

The JavaScript port is `sims/a2mba-context-int32-pilot.js`. It retains the implementation's signed arithmetic-right-shift behavior and 32-bit wraparound semantics. `test/a2mba-context-int32-pilot.test.js` checks all 3,012 `(shift, selectedBits, variant)` parameter families on edge values, 200,000 additional deterministic random samples, and 100,000 random odd-key inverse cases.

Local Node 22.16.0 on Linux passed all three tests. This is a functional screen, not cross-platform admission evidence.

## Source-aware algebraic collapse

For every admitted parameter set, the Context Trap has an exact seed-independent reduction. Let `low = input & selectedBits` and `high = input & ~selectedBits`. The masks are disjoint and cover the input bits.

The trap arm first clears every bit that could be lost or sign-extended by the shift. Shifting left then arithmetically right therefore restores the selected low bits and leaves the poison bit clear. After projection:

`trapProjection = low`.

The trigger arm forces the source bit that becomes the sign bit after the left shift. The arithmetic right shift sign-fills through the poison position while preserving the selected low bits. XOR with the poison bit removes that forced bit, so:

`triggerLow = low`.

Substituting those equalities into the six reconstruction forms gives `protectedLow = low` in every case. The final OR, XOR, or addition with `high` is exact because `high` and `low` occupy disjoint bit positions. Therefore every six-form Context Trap reduces to the original Int32 input.

This is a direct source-aware collapse for the isolated port. It means the cheap form cannot receive static-resistance credit merely from its surface expression. A future integration would need to demonstrate that interleaving with genuine computation materially changes attacker cost under a frozen normalizer.

## Local hot-work cost screen

The pilot wraps a small native Int32 kernel and measures seven alternating CPU pairs over 10,000,000 calls per sample. The repository's strict rule treats any observed pair above 2.5x as a veto for the sampled workload.

| Candidate | ratio of medians | strict >2.5x pairs | max pair |
| --- | ---: | ---: | ---: |
| Context v0 | 1.14637x | 0/7 | 1.17555x |
| Context v1 | 1.44585x | 0/7 | 1.78713x |
| Context v2 | 1.44342x | 0/7 | 1.66284x |
| Context v3 | 1.43435x | 0/7 | 1.54966x |
| Context v4 | 1.45839x | 0/7 | 1.57993x |
| Context v5 | 1.43654x | 0/7 | 1.65608x |
| Context v0 + Newton nonlinear envelope | 3.06492x | **7/7** | 3.24952x |

The nonlinear-envelope row uses one documented `XorAdd` factor construction, an odd key made with `| 1`, and the implementation's faster two-bit Newton seed (`2 - key`), which removes one refinement relative to the one-bit seed. Other external variants can change constants and instruction scheduling, so these numbers do not measure every A²MBA configuration. The sampled direct port already fails every strict pair locally, which is enough to deprioritize that direct envelope design until a materially cheaper formulation is proposed.

## Decision

The isolated Context Trap has a plausible JavaScript cost envelope on this local hot workload. Its exact algebraic identity is also immediately available to a source-aware attacker. That combination does not yet advance the primary strong-obfuscation objective.

The direct nonlinear-envelope port moves the syntax outside the simple linear trap identity, though its local hot-work cost crosses the 2.5x ceiling in every sampled pair. Spending integration effort on that exact runtime inverse circuit is therefore low priority.

A worthwhile next A²MBA experiment should change the emitted program structure before consuming more runtime budget. One candidate is to fuse a cheap context identity into an already-required arithmetic graph so the wrapper does not remain syntactically isolatable, then freeze a source-aware simplifier before held-out seeds and compare against an ordinary minified equal-trust control. Any such candidate still needs Windows and Ubuntu evidence, actual transformed-work yield, and full application-level adversarial evaluation before promotion.

## Reproduction

Run:

```text
node --test test/a2mba-context-int32-pilot.test.js
node sims/a2mba-context-int32-pilot.js
```

The pilot records its external source repository and immutable source commit in its JSON output.
