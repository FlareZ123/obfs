# Intermediate result: A²MBA rotated-core Int32 feasibility screen

**Date:** 2026-11-19  
**Status:** intermediate feasibility evidence. This ports the pinned `rotated-core` coordinate-region emitter from an independent A²MBA LLVM implementation into JavaScript Int32 arithmetic. It is a component screen, not evidence that the full A²MBA system or an obfs integration resists a full-control attacker.

## Question

The isolated Context Trap port has a cheap local runtime profile but collapses algebraically to the wrapped value. Its documented nonlinear envelope crosses the local 2.5x hot-work ceiling even with the faster two-bit Newton seed. The same pinned external implementation also contains a `rotated-core` region mode that keeps several intermediate values in rotated bit coordinates, with a special packed-add rule to carry addition across the rotation boundary.

This screen asks whether that coordinate representation maps cleanly to JavaScript Int32 and whether its selected-work overhead is low enough to justify a later source-aware attacker experiment.

## Source pin and port

External implementation: `xqzme69/A2MBA-LLVM` at commit `f22cafe972989f868b2898ac4839df27fb74fc61`. Relevant files are `lib/CoordinateRegion.cpp`, `lib/HybridCore/coordinates.json`, and `test/Wrapper/coordinates.c`.

The JavaScript pilot `sims/a2mba-rotated-core-int32-pilot.js` ports the external wrapper fixture after the implementation's `Region.trimLeaves()` boundary. The leaf operations remain native. The closed four-node core is rotated by a fixed build-time distance from 1 through 31. XOR and OR run directly in the rotated coordinate system. Additions use the pinned `packedRotatedAdd` rule. The final word is rotated back before observation.

Compile-time rotation constants are hoisted once when the candidate function is built. This matters for a faithful cost screen: an earlier scratch version recomputed `2 ** rotation` inside every hot add and produced artificial roughly 10x slowdowns for most rotations. Those measurements are discarded.

## Correctness evidence

`test/a2mba-rotated-core-int32-pilot.test.js` checks:

- all 31 rotation distances on 20,000 deterministic random four-input cases each, 620,000 region comparisons total;
- 310,000 rotate-left/rotate-right inverse checks;
- 310,000 packed-add conjugacy checks;
- edge-value comparisons for all 31 rotations.

Local Node 22.16.0 on Linux passed all four focused tests. This is sampled functional evidence rather than exhaustive Int32 proof or cross-platform admission.

## Static reconstruction boundary

The coordinate transform is a public conjugation by a fixed bit rotation. Let `R` be the selected rotation. For bitwise XOR, AND, and OR, bit permutation commutes with the operation: applying the operation to `R(a)` and `R(b)` produces `R(a op b)`. The packed-add rule exists specifically to make the same relation hold for addition. The final `R^-1` therefore reconstructs the original region result.

A source-aware attacker that recognizes the rotation boundary and the packed-add rule can move the graph back to ordinary coordinates, replace each packed add with native addition, and recover the original operator graph. The random rotation changes representation and syntax, but it is not a secret or one-way mapping. This component should receive no static-confidentiality credit until an integrated emitted source defeats a frozen normalizer that performs this canonicalization.

## Local hot-work cost screen

The benchmark uses the external four-input coordinate fixture, five million calls per sample, seven alternating native/protected CPU pairs, and compile-time-specialized constants. Ten representative rotations were sampled.

| Rotation | ratio of medians | strict >2.5x pairs | max pair |
| ---: | ---: | ---: | ---: |
| 1 | 1.86119x | 0/7 | 2.04488x |
| 2 | 1.86848x | 0/7 | 1.88681x |
| 3 | 1.77132x | 0/7 | 1.94734x |
| 4 | 1.85842x | 0/7 | 1.89205x |
| 5 | 1.86860x | 0/7 | 1.97506x |
| 8 | 2.34871x | 0/7 | 2.43128x |
| 11 | 1.91268x | 0/7 | 1.94876x |
| 16 | 1.84871x | 0/7 | 2.18686x |
| 23 | 1.88841x | 0/7 | 1.96730x |
| 31 | 1.84101x | 0/7 | 1.89653x |

No sampled pair crossed 2.5x. Rotation 8 came close enough that cross-platform and repeated-source evidence is still required before treating the component as budget-safe. The benchmark measures one selected hot region and excludes startup, whole-application effects, source generation, and other A²MBA layers.


## Frozen source-only held-out recovery

The bounded Acorn normalizer was frozen at commit `2c478bb5e9418cc6ba0c59ef5d963a9cc3cb9614` before the held-out corpus existed. A later typing-only refactor at `49b0973fd7f30160f9c96b89df7e9e7cf44352fd` replaced callback syntax with loops to satisfy strict JSDoc; it did not change the recognizer's accepted source shapes or recovery rules.

The post-freeze generator uses the fixed seed `heldout-after-2c478bb5:2026-11-19:agent38:a2mba-rotated-core:v1`. It emits 32 cases after the attacker freeze, varying rotation distance, all local/helper/parameter identifiers, commutative operand ordering in rotate/packed-add spelling, and cyclic helper declaration order. The attacker receives only the emitted source string. It parses the source and reconstructs the ordinary-coordinate fixture without executing the protected candidate.

Manual attacker-normalizer run [44447366918](https://github.com/FlareZ123/obfs/actions/runs/44447366918) passed on both `ubuntu-latest` and `windows-latest` at executable head `49b0973fd7f30160f9c96b89df7e9e7cf44352fd`. The A²MBA gate includes the held-out test, and both jobs also passed main and external strict JSDoc. The held-out test requires **32/32** exact recoveries and 2,000 post-recovery semantic samples per case.

This is a bounded family result. It establishes that simple seed/identifier/spelling variation does not rescue the public rotated-coordinate representation from a source-aware recognizer. It does not establish generic recovery of arbitrary A²MBA output or arbitrary JavaScript arithmetic.

## Decision

The rotated-core representation is worth a narrower follow-up because this local selected-work screen leaves measurable runtime headroom, unlike the direct nonlinear-envelope port. Its algebraic structure also gives a concrete adversarial target: a frozen normalizer should recover the operator graph by undoing the public coordinate system.

The next useful experiment is therefore adversarial rather than feature integration. Freeze a source-aware canonicalizer against a fixed emitted fixture, then generate held-out rotation distances and source-shape variants after the attacker is frozen. If that canonicalizer recovers all held-out graphs, this component remains a compatibility/performance technique with no demonstrated static-security gain. Only if realistic integration materially defeats that recovery while preserving the strict runtime boundary should it receive further implementation budget.

## Reproduction

```text
node --test test/a2mba-rotated-core-int32-pilot.test.js
node sims/a2mba-rotated-core-int32-pilot.js
```
