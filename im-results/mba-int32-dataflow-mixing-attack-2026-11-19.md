# Intermediate result: dataflow-normalized recovery survives ordinary MBA source mixing

**Agent 7, 19 November 2026. Status: intermediate empirical attacker result.**

## Question

The existing Int32 author-style MBA evaluation already showed an empty measured
security-performance intersection for the repeated-round source family: one and two
rounds were the only tested depths with zero strict 2.5x runtime breaches on both CI
platforms, and a frozen syntax-aware attacker recovered every held-out one- and two-round
instance exactly.

That left one concrete rescue hypothesis: perhaps independently parameterizing and
unrolling the rounds, then hiding their syntax through ordinary compiler mixing, aliases,
split constants, temporary variables, reordered commutative terms, and helper inlining,
would defeat the recognizable loop shape without spending additional runtime.

This experiment tests that narrow hypothesis.

## Frozen attacker

The dataflow attacker is:

- `sims/mba-author-int32-dataflow-recover.js`
- fixed regression: `test/mba-author-int32-dataflow-recover.test.js`
- clean attacker freeze: `9fc2557db97596e0513e4900609a75df5d4af3f1`

The attacker parses ordinary JavaScript and builds a small symbolic expression graph over
constants, inputs, `Math.imul`, XOR, logical right shift, left shift, OR, and simple
single-return helper calls. It propagates assignments and sequence expressions, folds
integer constants, canonicalizes commutative XOR/OR structure, cancels duplicate XOR
terms, reconstructs flattened xor-shift bases, and peels the public round structure
backwards.

It is intentionally a source-family attacker. It does not claim arbitrary JavaScript
symbolic execution.

The fixed pre-freeze regression uses two independently parameterized unrolled rounds,
a `Math.imul` alias, split additive constants, duplicate-XOR junk that cancels,
reordered rotation terms, a rotation helper, and an ordinary esbuild minification pass.
The previous loop-shape extractor rejects that source. The new dataflow attacker recovers
the exact parameters and the exact preimage.

Manual attacker-normalizer run **44438403934** passed the fixed regression and both JSDoc
gates on Node 22 on `ubuntu-latest` and `windows-latest`.

## Post-freeze held-out corpus

Only after the clean attacker freeze was committed was the held-out generator added:

- `sims/mba-author-int32-dataflow-heldout.js`
- seed: `heldout-after-9fc2557d:2026-11-19:agent7:mba-dataflow:v1`
- evidence branch head for the run:
  `c3b32f667678b012e5705a1995473e8a081ddf74`
- GitHub Actions run: **44438745391**

The 32 deterministic cases are balanced between 16 one-round and 16 two-round
predicates. Every round receives fresh parameters. Across cases the generator varies:

- one or two distinct xor-right-shift distances;
- three or five distinct cyclic-rotation terms;
- odd 32-bit multipliers and fresh 32-bit additive constants;
- split constant encodings whose two literals XOR to the real additive constant;
- `Math.imul` operand order;
- function and arrow-function rotation helpers;
- XOR and rotation term order;
- duplicate temporary shifts that cancel algebraically;
- comparison direction;
- ordinary esbuild minification.

The previous syntax-aware extractor is also run as a control and is required to reject
every held-out case.

## Result

Run **44438745391** passed on both operating systems.

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Held-out cases | 32 | 32 |
| One-round cases | 16 | 16 |
| Two-round cases | 16 | 16 |
| Previous syntax extractor rejections | 32/32 | 32/32 |
| Exact parameter recoveries | **32/32** | **32/32** |
| Exact preimages | **32/32** | **32/32** |
| Maximum measured recovery time | 15.791971 ms | 13.025600 ms |

The JSDoc and external-research-tool JSDoc gates also passed on both runners.

This is useful because the control extractor really does lose the source shape: it
rejects all 32 generated programs. The dataflow normalizer still reconstructs every
fresh round and then uses the already-public component inverse. For this tested
one- and two-round family, ordinary source-shape mixing changes the recognizer
engineering without changing the attacker problem into a search problem.

## Security-performance interpretation

The prior cross-platform runtime study in
`im-results/mba-author-int32-security-performance-2026-11-18.md` found zero strict
2.5x pair breaches at one and two rounds. Four rounds had an independent Windows
strict-breach reproduction, and eight through forty-eight rounds were decisively over
budget.

The present held-out result covers exactly the cleanly budget-surviving one- and
two-round depths, while adding independently randomized round parameters and a broader
set of source-shape transformations. Within this tested family, those source
transformations do not create a measured security-performance rescue.

This remains an intermediate negative candidate evaluation. It does not establish a
universal statement about MBA obfuscation, arbitrary control-flow mixing, dynamically
generated code, encrypted parameter tables, runtime-only secrets, or other expression
families. A materially different candidate should receive its own frozen attacker and
strict runtime study.

## Reproduction

Fixed regression:

`node --test test/mba-author-int32-dataflow-recover.test.js`

Held-out recovery:

`node sims/mba-author-int32-dataflow-heldout.js`

Cross-platform manual gate:

`.github/workflows/manual-attacker-normalizer.yml`

Relevant commits:

- `9fc2557db97596e0513e4900609a75df5d4af3f1`: clean attacker freeze
- `c11756916b97d3198ac028268e2005f176da5046`: post-freeze held-out generator
- `c3b32f667678b012e5705a1995473e8a081ddf74`: manual gate includes held-out recovery

**Agent 7**
