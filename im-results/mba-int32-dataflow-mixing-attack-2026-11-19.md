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

## Table-indexed loop extension

A second frozen-attacker experiment asks whether keeping the rounds in a real loop and
moving the public per-round constants and shifts into arrays changes the result.

The attacker extension was fixed and cross-platform tested before the held-out corpus:

- fixed table-indexed regression commit:
  `ea38b303d26c09493ddb88d0a680f96ee4d5c230`
- fixed-case Actions run: **44439318005**
- post-freeze seed:
  `heldout-after-ea38b303:2026-11-19:agent7:mba-table-loop:v1`
- held-out harness: `sims/mba-author-int32-table-heldout.js`
- held-out evidence run: **44439551438**

The held-out corpus again contains 32 cases, balanced 16 one-round / 16 two-round.
Each case uses fresh per-round values and stores them in indexed public arrays. Across
the corpus the source varies one or two xor shifts, three or five rotation terms,
split additive constants in separate arrays, multiplication operand order, loop tests
using either `i < a.length` or `i <= a.length - 1`, updates using either `i++`
or `i += 1`, helper spelling, term order, comparison direction, and ordinary
esbuild minification.

The older syntax extractor rejected all cases because the round parameters are no
longer literal repeated-round operands. The frozen dataflow evaluator statically
executes the bounded loop with the concrete public arrays, reconstructs the same
round semantics, and applies the public inverse.

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Held-out cases | 32 | 32 |
| One-round cases | 16 | 16 |
| Two-round cases | 16 | 16 |
| Previous syntax extractor rejections | 32/32 | 32/32 |
| Exact parameter recoveries | **32/32** | **32/32** |
| Exact preimages | **32/32** | **32/32** |
| Maximum measured recovery time | 15.299564 ms | 16.042300 ms |

Both JSDoc gates passed on both runners. This closes the specific public-parameter-table
rescue tested here: loop preservation and array indexing add a static partial-evaluation
step, while the recovered attacker problem remains direct inversion.

## Constant-state CFG extension

A third frozen-attacker experiment tests a small control-flow flattener. The protected
predicate stores the next block as a concrete state value, dispatches through a
`switch` inside a bounded loop, and places the MBA rounds in state cases whose source
order differs from execution order.

The evaluator extension was validated before the held-out corpus:

- frozen attacker commit:
  `0bf4a4ff66d90c6a04d11c36e88b8fbbd7433935`
- fixed-case Actions run: **44440239144**
- post-freeze seed:
  `heldout-after-0bf4a4ff:2026-11-19:agent7:mba-cfg:v1`
- held-out harness: `sims/mba-author-int32-cfg-heldout.js`
- held-out evidence run: **44440642037**

The 32 held-out cases are balanced 16 one-round / 16 two-round. Every case receives
fresh MBA parameters and fresh dispatcher labels. The generator varies one or two
xor shifts, three or five rotation terms, split additive constants, multiplication
operand order, rotation-helper spelling, XOR and rotation term order, comparison
direction, `!==` versus `!=` dispatcher tests, case order, and an unreachable dead
case. The emitted source is passed through ordinary esbuild minification.

The legacy loop extractor rejects all generated cases. The frozen dataflow evaluator
partially executes the concrete dispatcher, follows the selected cases, reconstructs
the round graph, and then applies the public inverse.

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Held-out cases | 32 | 32 |
| One-round cases | 16 | 16 |
| Two-round cases | 16 | 16 |
| Previous syntax extractor rejections | 32/32 | 32/32 |
| Exact parameter recoveries | **32/32** | **32/32** |
| Exact preimages | **32/32** | **32/32** |
| Maximum measured recovery time | 8.372432 ms | 12.068500 ms |

The existing dataflow and table-indexed corpora remained green in the same run, and
both JSDoc gates passed on Ubuntu. The Windows attacker steps and JSDoc gate also
passed; its final external JSDoc step was still completing when the held-out metrics
were extracted. The fixed evaluator run **44440239144** had already passed both type
gates on both platforms.

This closes the tested constant-state dispatcher rescue for the one- and two-round
family. The added source structure requires bounded static partial evaluation and
keeps the recovered round semantics directly invertible.


## Deterministically encoded public-table extension

A fourth experiment tests whether reversible literal encoding of the public
per-round tables changes the attack. Each stored additive coefficient is offset by
a public key, each multiplier is XOR-masked, and each xor-shift or rotation distance
is stored under a public arithmetic or XOR encoding. The predicate decodes those
values only at their use sites inside the round loop.

The fixed encoded-table regression was added only after the dataflow evaluator
already handled its required constant operations:

- fixed regression commit:
  `a800804e69543514c8fd5480a5960ca1dd0ff872`
- fixed-case Actions run: **44440738034**
- post-freeze held-out generator commit:
  `753a1f57683243f0bc58b2a18de9ea589077b421`
- post-freeze seed:
  `heldout-after-a800804e:2026-11-19:agent7:mba-encoded-tables:v1`
- held-out harness: `sims/mba-author-int32-encoded-heldout.js`
- final evidence run: **44441047391**
- final evidence source:
  `f795ff596c9bbcd93fe8e806988c394bc75bc58e`

The held-out corpus again has 32 deterministic cases, balanced 16 one-round and
16 two-round predicates, with fresh parameters and encoding keys. The older
syntax extractor rejects all cases. The frozen dataflow evaluator folds the
public decoders while statically executing the bounded round loop, then applies
the existing public component inverse.

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Held-out cases | 32 | 32 |
| One-round cases | 16 | 16 |
| Two-round cases | 16 | 16 |
| Exact parameter recoveries | **32/32** | **32/32** |
| Exact preimages | **32/32** | **32/32** |
| Maximum measured recovery time | 13.804673 ms | 16.221100 ms |

Run **44441047391** also reran the earlier dataflow, table-loop and flattened-CFG
held-out corpora and passed both the repository JSDoc gate and the external
research-tool JSDoc gate on Ubuntu and Windows.

This rules out the tested reversible public-table encoding as a source-shape
rescue. The encoding adds a constant-folding step while leaving every decoding
key and transformation publicly available.

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
