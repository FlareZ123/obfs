# Held-out ESM property-flow protection and source-only label-neutralization attack

Date: 2026-11-15. Agent 14. Status: **intermediate empirical experiment**.

## Reproduction and frozen conditions

Implementation: [sims/heldout-object-flow-attack.js](../sims/heldout-object-flow-attack.js).
Regression: [test/heldout-object-flow-attack.test.js](../test/heldout-object-flow-attack.test.js).
Manual workflow: [manual-heldout-attack.yml](../.github/workflows/manual-heldout-attack.yml).

Pinned source SHA: **af57d935865fcbe2c57c9051638ac9343a7719f4**.
[GitHub Actions run 43708682711](https://github.com/FlareZ123/obfs/actions/runs/43708682711) completed successfully on Ubuntu and Windows using Node.js 22, including focused differential tests and the repository JSDoc typecheck. This run covers the pinned source, not subsequent commits.

The corpus is deterministically generated from ten three-to-five-file ESM shapes with three numeric seeds each; 30 graphs and 96 source files in total. All files are directly imported or named within a supplied closed-world group. The trusted runner injects an external window.api to model hostile environment calls. The compiler is called with mode COO, closedWorld true, strings false, identifiers false so that measurements isolate cross-file private-property renaming. The seed is fixed per generated graph. Each graph carries two candidate private data keys, for 60 in total.

The native original, transformed output and source-only attack result are each written atomically to separate temporary directory trees and executed through Node's real ESM loader. The output comparison uses the same external API implementation in each execution. The final attacker receives the transformed files only and uses the independent Acorn-token consumer in sims/attacker-token-normalize.js. It does not load internal compiler parse, transform or edit helpers. It maps recognizable hashed property names to neutral stable labels across all files without recovering the original private spellings. The earlier pinned run used the existing sims/offline-normalize.js; both are retained as controls. It performs neither control-flow reconstruction nor general decompilation.

## Observations

| Measure | Ubuntu | Windows |
|---|---:|---:|
| Generated ESM graphs | 30 | 30 |
| Generated source files | 96 | 96 |
| Positive owned-object graphs | 9 | 9 |
| Refusal graphs | 21 | 21 |
| Candidate private fields | 60 | 60 |
| Renamed private fields | 18 | 18 |
| Attacker-neutralized labels | 18 | 18 |
| Transformed outputs matching native | 30/30 | 30/30 |
| Normalized outputs matching native | 30/30 | 30/30 |
| Input source bytes | 9,740 | 9,740 |
| Transformed source bytes | 9,758 | 9,758 |
| Static AST normalization elapsed, one run | 4.725 ms | 9.352 ms |

The measured **30% candidate-key coverage** includes all generated candidates, even deliberate refusal cases. It should never be promoted as a percentage of typical JavaScript application code protected. The 18-byte source growth is 0.185% for this fixture and these compiler options. The timing is a single elapsed-process observation of AST normalization across 30 small graphs, not a benchmark of deobfuscation cost or a performance bound. Startup, hot path, cold start and 2.5x adherence were **not** measured in this run.

The three accepted graph kinds each have three seeded examples and two renamed keys per example: direct named-import member access, imported pure reader helpers, and imported identity forwarding into pure readers. The seven decline kinds each have three examples: an externally supplied computed key, JSON serialization, an opaque external API reader, a reader invoked on a foreign object, own-key reflection, function-source observation, and an ESM dynamic loader.

## Independent security dimensions and interpretation

- **Static reconstruction:** 18/18 compiler-generated hashed property labels were neutralized by a source-only AST attacker, and every neutralized output matched its original on the fixed runtime observation. This is successful removal of a syntactic obfuscation layer. It does not identify the erased original names or prove equivalent behavior under arbitrary inputs.
- **Dynamic instrumentation:** not attempted. The static attacker was sufficient to remove the key-label surface being measured.
- **Tamper resistance and location binding:** not evaluated. There was no runtime authorization requirement in the fixtures.
- **Correctness:** all 30 transformed outputs matched their originals, with 21 intentional refusals. The proof is only relative to the fixed sample observations.
- **Performance:** static attack time is reported for reproducibility but there is no protected-work 2.5x runtime result here.

This experiment directly measures transformation coverage that broad CodeNet examples did not exercise (their reported renamed-field count was zero). It also demonstrates why compatibility success cannot be treated as obfuscation strength: the protected labels are statically recognizable and mechanically replaceable even when source renaming is behavior-preserving.

## Follow-up research

Expand the withheld graph generator to realistic modules containing asynchronous state, classes, callbacks, inheritance, conditional aliases, and external web APIs; measure how often conservative refusal is necessary. Then compare a genuinely harder-to-neutralize transform against the same source-only adversary and a separate runtime-instrumented attacker. Require novel security observations and end-to-end timing before proposing it as a release default. Retain this experiment as a negative control.

## Independent attacker replication

A separate pinned [manual Linux/Windows run 43709096598](https://github.com/FlareZ123/obfs/actions/runs/43709096598) at SHA **311e355c5c179c6e45925de5cfa6b012c3d1a67b** passed after swapping the normalization oracle to independently implemented Acorn token processing. All 30 transformed and all 30 independently normalized graphs again matched the native originals, with the same 18/60 renamed private fields and 18 independently neutralized labels. Single-pass token normalization across the 30 graphs measured 5.883 ms on Ubuntu and 8.067 ms on Windows. Source bytes and function protection counts were unchanged. The original run's timing in the table refers to the earlier attack implementation; both timings are single executions, unsuitable for performance ranking. The new attacker has no dependency on internal obfuscator parser/edit routines, although it shares the publicly declared Acorn package.
