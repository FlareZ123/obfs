# Intermediate result: Int32 MBA security-performance frontier

**Date:** 2026-11-18  
**Status:** intermediate empirical result. This is a JavaScript Int32 adaptation of the public author component family, not a claim about every MBA expression or every experiment in the paper.

## Question

The faithful unsigned 64-bit BigInt transcription is far above this repository's 2.5x repeated-work limit. A natural rescue is to use the same polynomial-XOR, xor-shift, and cyclic-XOR structure over JavaScript's native 32-bit bitwise lane with `Math.imul`. Does that adaptation create a useful region where runtime stays below the project limit while ordinary-minified source resists a generator-aware attacker?

The ECMAScript 2026 specification defines `Math.imul` as multiplication modulo 2^32 after `ToUint32`, and unsigned right shift as a zero-filling shift after `ToUint32`:
- https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html#sec-math.imul
- https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html#sec-number::unsignedrightshift

Those semantics make the 32-bit adaptation an exact finite-word computation rather than a floating-point approximation.

## Frozen implementation and attacker

The reusable component implementation is:
- `sims/mba-author-int32-component-inverse.js`
- `sims/mba-author-int32-heldout.js`

The source-aware minified attacker was frozen **before** the held-out corpus:
- attacker commit: `dbe09e3ab6883c0939b2ec89f82841a81c98771d`
- attacker: `sims/mba-author-int32-minified-recover.js`
- fixed pre-freeze regression: `test/mba-author-int32-minified-recover.test.js`
- attacker-only evidence run: GitHub Actions `44424401133`

Only after that commit passed its fixed fixture was the held-out seed created:

`heldout-after-dbe09e3a:2026-11-18:agent6:mba-int32-minified:v1`

The held-out generator uses fresh odd 32-bit multipliers, independent constants, one or two xor-right-shift distances, three or five cyclic rotation terms, fresh 32-bit secrets, syntax variants for multiplication/XOR order and rotate spelling, and only round depths 1 or 2. Those are the depths that survived every strict pair in the cross-platform runtime profile below. Each source is passed through the repository's installed esbuild minifier before the frozen attacker sees it.

## Security observation: budget-surviving depths are structurally recovered

Actions run **44424543167**, exact evidence branch commit
`e2df10fa98e2e97747613536212fe653e40c74f0`, passed on Node 22 on Ubuntu and Windows.

Each platform reported:

- 32 held-out cases
- **32/32 exact parameter recoveries**
- **32/32 exact preimages**
- all fixed and held-out regression tests green
- isolated strict JSDoc green

The attacker does not execute the protected predicate to query it. It parses the ordinary-minified source, recovers the literal repeated-round count, polynomial constant and multiplier, xor-shift distances, cyclic rotate distances, and public comparison target, then applies the public component inverse.

This is a generator-aware attack against a deliberately bounded source family. It does not establish that arbitrary MBA rewriting, independently randomized per-round expressions, or a different AST mixing scheme is equally recognizable.

## Performance observation: the strict frontier is below four rounds cross-platform

Actions run **44424177927**, exact evidence branch commit
`0bd3f28869ec5714fafcd5640af584525fdeac11`, ran the committed profile in
`sims/mba-author-int32-heldout.js` on Node 22 on Ubuntu and Windows. It compares the repeated Int32 transform against the native predicate `code === 47`, with nine alternating paired CPU samples per depth.

| Rounds | Ubuntu median ratio | Ubuntu strict >2.5 pairs | Ubuntu max pair | Windows median ratio | Windows strict >2.5 pairs | Windows max pair |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1.24833x | 0/9 | 1.25715x | 0.94512x | 0/9 | 1.24601x |
| 2 | 1.81061x | 0/9 | 1.83556x | 1.74121x | 0/9 | 1.90549x |
| 4 | 2.34132x | 0/9 | 2.35078x | 2.27405x | **2/9** | **2.83537x** |
| 8 | 4.38227x | 9/9 | 4.43219x | 4.29878x | 9/9 | 4.53488x |
| 16 | 8.40841x | 9/9 | 8.47121x | 9.51220x | 9/9 | 10.99042x |
| 32 | 18.27620x | 9/9 | 18.44282x | 19.05488x | 9/9 | 23.56902x |
| 48 | 28.10907x | 9/9 | 28.30874x | 30.94512x | 9/9 | 34.82428x |

Under the repository's current decision rule, an observed strict pair above 2.5x vetoes that supported workload even when the median is below 2.5x. Therefore the four-round case is already vetoed by two Windows pairs. One and two rounds are the only tested depths with zero strict violations on both platforms.

The repository also has a separate same-code placebo showing that very small Windows CPU observations can occasionally cross a strict ratio threshold. That matters to causal attribution of the four-round tail. It does not rescue this candidate's security-performance decision because the one- and two-round depths that cleanly survive the strict gate are themselves the post-freeze source-recovery cases above.

## Decision

For this repeated-round degree-1 Int32 adaptation, the measured security-performance intersection is empty:

1. **One and two rounds:** pass every tested strict runtime pair, and the frozen minified-source attacker recovers every held-out parameter set and preimage.
2. **Four rounds:** already has strict cross-platform runtime violations under the project's admission rule.
3. **Eight through forty-eight rounds:** violate every strict pair on both tested operating systems.

The result does **not** show that all mixed Boolean-arithmetic obfuscation is ineffective. It rejects a specific rescue hypothesis: replacing the public 64-bit BigInt permutation chain with a native Int32 `Math.imul`/bitwise transcription and relying on repeated depth for source resistance.

A future MBA candidate should justify a materially different source structure before receiving more performance budget. In particular, it should be evaluated against a frozen source-aware normalizer after realistic inlining/mixing and against an ordinary minified control. Merely increasing round count moves this exact family farther outside the runtime budget without fixing the public inverse.

## Reproduction

Fast regressions:

- `node --test test/mba-author-int32-heldout.test.js`
- `node --test test/mba-author-int32-minified-recover.test.js`
- `node --test test/mba-author-int32-minified-heldout.test.js`

Research emitters:

- `node sims/mba-author-int32-heldout.js`
- `node sims/mba-author-int32-minified-heldout.js`

The manual workflow overrides used for runs 44424177927 and 44424543167 live only on evidence branches and are intentionally excluded from this feature branch.
